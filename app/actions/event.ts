"use server";

import { EventPrivacyType, EventStatus } from "@prisma/client";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  canCreateEvent,
  canPublishEvents,
  getMembership,
  isUserEmailVerified,
} from "@/lib/permissions";
import { isReservedEventSlug, slugifyTitle, withSlugSuffix } from "@/lib/slug";
import {
  createEventSchema,
  cloneEventSchema,
  deleteEventSchema,
  updateEventSchema,
  updateEventSlugSchema,
} from "@/lib/validators";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";
import { getPublicUrl, uploadFile } from "@/lib/storage";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { createSafeWebpDerivative } from "@/lib/imageValidation";
import { recordAuditEvent } from "@/lib/audit";
import { z } from "zod";
import { isOrganisationUploadUrl } from "@/lib/uploadUrl";
import { richTextToPlainText, sanitizeRichText } from "@/lib/richText";
import { hasPaidOrders, notifyEventCancelled, peopleWithPlaces, refundCancelledEvent } from "@/lib/payments/eventCancellation";
import { noticeEach, noticeSubject, whenLabel } from "@/lib/notices";
import { getBroadcastBaseUrl } from "@/lib/eventBroadcast";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024;
const publishEventSchema = z
  .object({
    organisationSlug: z.string().trim().min(1).max(120),
    eventSlug: z.string().trim().min(1).max(64),
  })
  .strict();

export async function uploadEventCoverImage(
  formData: FormData,
): Promise<ActionResult<{ url: string; }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };
  if (!(await isUserEmailVerified(session.user.id)))
    return {
      ok: false,
      error: "Verify your email before uploading event images.",
    };
  if (await isActionRateLimited("upload", session.user.id)) {
    return { ok: false, error: "Too many uploads. Please try again later." };
  }

  const organisationSlug = String(
    formData.get("organisationSlug") ?? "",
  ).trim();
  const file = formData.get("file");
  if (!organisationSlug || !(file instanceof File)) {
    return { ok: false, error: "Choose an image to upload." };
  }
  if (file.size === 0 || file.size > MAX_COVER_IMAGE_BYTES) {
    return { ok: false, error: "Cover images must be 5 MB or smaller." };
  }
  const org = await prisma.organisation.findUnique({
    where: { slug: organisationSlug },
  });
  if (!org) return { ok: false, error: "Organisation not found." };
  const membership = await getMembership(session.user.id, org.id);
  if (!canCreateEvent(membership)) {
    return {
      ok: false,
      error: "You do not have permission to upload cover images.",
    };
  }
  try {
    const derivative = await createSafeWebpDerivative(file, {
      width: 2400,
      height: 2400,
      fit: "inside",
    });
    if ("error" in derivative) return { ok: false, error: derivative.error };
    const key = `organisations/${org.id}/event-covers/${crypto.randomUUID()}.webp`;
    await uploadFile({
      key,
      body: derivative.body,
      contentType: "image/webp",
      organisationId: org.id,
    });
    return { ok: true, data: { url: getPublicUrl(key) } };
  } catch {
    console.error("[event] cover image upload failed");
    return { ok: false, error: "Could not upload the cover image." };
  }
}

function revalidateEventPaths(
  orgSlug: string,
  eventSlug: string,
  eventId: string,
) {
  revalidatePath(`/${orgSlug}`);
  revalidatePath(`/${orgSlug}/${eventSlug}`);
  revalidatePath(`/dashboard/${orgSlug}`);
  revalidatePath(`/dashboard/${orgSlug}/event/${eventId}`);
}

function validationError(error: Parameters<typeof flattenZodErrors>[0]) {
  const fieldErrors = flattenZodErrors(error);
  const message = Object.values(fieldErrors).flat()[0] ?? "Invalid input.";
  return { error: message, fieldErrors };
}

export async function createEvent(
  input: unknown,
): Promise<ActionResult<{ id: string; slug: string; }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }
  if (!(await isUserEmailVerified(session.user.id))) {
    return { ok: false, error: "Verify your email before creating events." };
  }
  if (await isActionRateLimited("create", session.user.id)) {
    return {
      ok: false,
      error: "Too many creation attempts. Please try again later.",
    };
  }

  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) {
    const validation = validationError(parsed.error);
    return {
      ok: false,
      ...validation,
    };
  }

  const data = parsed.data;
  const aboutHtml = sanitizeRichText(data.aboutHtml);
  const description = richTextToPlainText(aboutHtml).slice(0, 10_000);
  if (!description) {
    return { ok: false, error: "About the event is required." };
  }
  const org = await prisma.organisation.findUnique({
    where: { slug: data.organisationSlug },
  });
  if (!org) {
    return { ok: false, error: "Organisation not found." };
  }

  const membership = await getMembership(session.user.id, org.id);
  if (!canCreateEvent(membership)) {
    return {
      ok: false,
      error: "Only owners and admins can create events.",
    };
  }
  if (
    data.coverImageUrl &&
    !isOrganisationUploadUrl(data.coverImageUrl, org.id, "event-covers")
  ) {
    return { ok: false, error: "Choose an uploaded cover image." };
  }
  if (data.status !== EventStatus.DRAFT && !canPublishEvents(membership)) {
    return {
      ok: false,
      error: "Only owners and admins can publish or hide events.",
    };
  }

  const baseSlug = slugifyTitle(data.title);
  let slug = baseSlug;
  let attempt = 0;
  while (
    isReservedEventSlug(slug) ||
    await prisma.event.findUnique({
      where: {
        organisationId_slug: { organisationId: org.id, slug },
      },
    })
  ) {
    attempt += 1;
    if (attempt > 50) {
      return { ok: false, error: "Could not generate a unique URL slug." };
    }
    slug = withSlugSuffix(baseSlug, attempt);
  }

  try {
    const created = await prisma.event.create({
      data: {
        organisationId: org.id,
        title: data.title,
        slug,
        description,
        tags: data.tags ?? [],
        showRegistrationCount: data.showRegistrationCount ?? true,
        coverImageUrl: data.coverImageUrl || null,
        startDateTime: data.startDateTime,
        endDateTime: data.endDateTime,
        timezone: data.timezone,
        location: data.location ?? "",
        mapLinkUrl: data.mapLinkUrl || null,
        isOnline: data.isOnline ?? false,
        capacity: data.capacity ?? null,
        status: data.status ?? EventStatus.DRAFT,
        privacyType: data.privacyType ?? EventPrivacyType.PUBLIC,
        registrationClosesAt: data.registrationClosesAt ?? null,
        registrationLeadMinutes: data.registrationLeadMinutes ?? null,
        page: {
          create: {
            isPublished: data.status === EventStatus.PUBLISHED,
            aboutHtml,
          },
        },
      },
    });

    await recordAuditEvent({
      action: "EVENT_CREATED",
      actorUserId: session.user.id,
      organisationId: org.id,
      targetType: "Event",
      targetId: created.id,
      metadata: { status: created.status },
    });

    revalidateEventPaths(org.slug, slug, created.id);
    return { ok: true, data: { id: created.id, slug: created.slug } };
  } catch {
    console.error("[event] creation failed");
    return { ok: false, error: "Could not create event." };
  }
}

export async function updateEvent(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }
  if (await isActionRateLimited("action", session.user.id))
    return { ok: false, error: "Too many updates. Please try again later." };

  const parsed = updateEventSchema.safeParse(input);
  if (!parsed.success) {
    const validation = validationError(parsed.error);
    return {
      ok: false,
      ...validation,
    };
  }

  const data = parsed.data;
  const org = await prisma.organisation.findUnique({
    where: { slug: data.organisationSlug },
  });
  if (!org) return { ok: false, error: "Organisation not found." };

  const membership = await getMembership(session.user.id, org.id);
  if (!canCreateEvent(membership)) {
    return { ok: false, error: "You do not have permission to edit events." };
  }

  if (data.status !== EventStatus.DRAFT && !canPublishEvents(membership)) {
    return {
      ok: false,
      error: "Only owners and admins can change visibility.",
    };
  }

  const event = await prisma.event.findFirst({
    where: { id: data.eventId, organisationId: org.id },
  });
  if (!event) return { ok: false, error: "Event not found." };
  const startMinute = (date: Date) => Math.floor(date.getTime() / 60_000);
  if (
    startMinute(data.startDateTime) !== startMinute(event.startDateTime) &&
    data.startDateTime < new Date()
  ) {
    return {
      ok: false,
      error: "Start time must be now or in the future.",
      fieldErrors: { startDateTime: ["Start time must be now or in the future"] },
    };
  }
  const aboutHtml =
    data.pageAboutHtml !== undefined
      ? sanitizeRichText(data.pageAboutHtml)
      : undefined;
  const description =
    aboutHtml !== undefined
      ? richTextToPlainText(aboutHtml).slice(0, 10_000)
      : (data.description ?? event.description);
  if (aboutHtml !== undefined && !description) {
    return { ok: false, error: "About the event is required." };
  }
  if (
    data.coverImageUrl &&
    !isOrganisationUploadUrl(data.coverImageUrl, org.id, "event-covers")
  ) {
    return { ok: false, error: "Choose an uploaded cover image." };
  }
  if (
    data.pageLogoUrl &&
    !isOrganisationUploadUrl(data.pageLogoUrl, org.id, "event-page-logos")
  ) {
    return { ok: false, error: "Choose an uploaded event page logo." };
  }

  try {
    const saved = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${event.id} FOR UPDATE`;
      if (data.capacity != null) {
        const confirmed = await tx.rSVP.count({
          where: { eventId: event.id, status: "CONFIRMED" },
        });
        if (confirmed > data.capacity) return false;
      }
      await tx.event.update({
        where: { id: event.id },
        data: {
          title: data.title,
          description,
          tags: data.tags ?? [],
          showRegistrationCount: data.showRegistrationCount ?? true,
          coverImageUrl: data.coverImageUrl || null,
          startDateTime: data.startDateTime,
          endDateTime: data.endDateTime,
          timezone: data.timezone,
          location: data.location ?? "",
          mapLinkUrl: data.mapLinkUrl || null,
          isOnline: data.isOnline ?? false,
          capacity: data.capacity ?? null,
          status: data.status,
          privacyType: data.privacyType,
          listedPublicly: data.privacyType === EventPrivacyType.APPROVAL_REQUIRED && data.listedPublicly,
          registrationClosesAt: data.registrationClosesAt ?? null,
          registrationLeadMinutes: data.registrationLeadMinutes ?? null,
        },
      });
      if (data.status === EventStatus.CANCELLED && event.status !== EventStatus.CANCELLED) {
        await notifyEventCancelled(tx, { organisationId: org.id, eventId: event.id, title: data.title });
      } else if (data.status === EventStatus.PUBLISHED && event.status === EventStatus.PUBLISHED && event.endDateTime > new Date()) {
        // Guests hear when the time or place changes, not about wording edits.
        const moved = data.startDateTime.getTime() !== event.startDateTime.getTime() || data.endDateTime.getTime() !== event.endDateTime.getTime() || data.timezone !== event.timezone;
        const relocated = (data.location ?? "") !== event.location || (data.isOnline ?? false) !== event.isOnline;
        if (moved || relocated) {
          await noticeEach(tx, await peopleWithPlaces(tx, { eventId: event.id }), {
            organisationId: org.id,
            subject: noticeSubject("Updated", data.title),
            lines: [
              `The organiser changed ${moved && relocated ? "the time and place" : moved ? "the time" : "the place"} of ${data.title}.`,
              `When: ${whenLabel(data.startDateTime, data.timezone)}`,
              `Where: ${data.isOnline ? "Online" : (data.location?.trim() || "to be announced")}`,
              `Your registration still stands. Event page: ${getBroadcastBaseUrl()}/${org.slug}/${event.slug}`,
            ],
          });
        }
      }
      await tx.eventPage.upsert({
        where: { eventId: event.id },
        create: {
          eventId: event.id,
          isPublished: data.status === EventStatus.PUBLISHED,
          tagline: data.pageTagline ?? "",
          logoUrl: data.pageLogoUrl || null,
          aboutHtml: aboutHtml ?? "",
        },
        update: {
          isPublished: data.status === EventStatus.PUBLISHED,
          ...(data.pageTagline !== undefined
            ? { tagline: data.pageTagline }
            : {}),
          ...(data.pageLogoUrl !== undefined
            ? { logoUrl: data.pageLogoUrl || null }
            : {}),
          ...(data.pageAboutHtml !== undefined
            ? { aboutHtml }
            : {}),
        },
      });
      return true;
    });
    if (!saved)
      return {
        ok: false,
        error:
          "Capacity cannot be lower than the current confirmed attendance.",
      };

    await recordAuditEvent({
      action: "EVENT_UPDATED",
      actorUserId: session.user.id,
      organisationId: org.id,
      targetType: "Event",
      targetId: event.id,
      metadata: { status: data.status },
    });

    // Cancelling an event refunds everyone who paid, in full.
    if (data.status === EventStatus.CANCELLED && event.status !== EventStatus.CANCELLED) {
      await refundCancelledEvent({ eventId: event.id, organisationId: org.id, actorUserId: session.user.id });
    }

    revalidateEventPaths(org.slug, event.slug, event.id);
    return { ok: true };
  } catch {
    console.error("[event] update failed");
    return { ok: false, error: "Could not update event." };
  }
}

export async function deleteEvent(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }
  if (await isActionRateLimited("action", session.user.id))
    return { ok: false, error: "Too many updates. Please try again later." };

  const parsed = deleteEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { organisationSlug, eventId } = parsed.data;
  const org = await prisma.organisation.findUnique({
    where: { slug: organisationSlug },
  });
  if (!org) return { ok: false, error: "Organisation not found." };

  const membership = await getMembership(session.user.id, org.id);
  if (!canCreateEvent(membership)) {
    return { ok: false, error: "You do not have permission to delete events." };
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, organisationId: org.id },
  });
  if (!event) return { ok: false, error: "Event not found." };
  // Deleting would leave people who paid without their tickets: cancel instead, which refunds them.
  if (await hasPaidOrders({ eventId: event.id })) {
    return { ok: false, error: "People have paid for this event. Cancel it instead, which refunds them in full." };
  }

  const slug = event.slug;
  try {
    await prisma.$transaction(async (tx) => {
      if (event.status === EventStatus.PUBLISHED && event.endDateTime > new Date()) await notifyEventCancelled(tx, { organisationId: org.id, eventId: event.id, title: event.title });
      await tx.event.delete({ where: { id: event.id } });
    });
    await recordAuditEvent({
      action: "EVENT_DELETED",
      actorUserId: session.user.id,
      organisationId: org.id,
      targetType: "Event",
      targetId: event.id,
    });
    revalidatePath(`/${org.slug}`);
    revalidatePath(`/${org.slug}/${slug}`);
    revalidatePath(`/dashboard/${org.slug}`);
    return { ok: true };
  } catch {
    console.error("[event] slug update failed");
    return { ok: false, error: "Could not delete event." };
  }
}

export async function updateEventSlug(
  input: unknown,
): Promise<ActionResult<{ slug: string; }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }
  if (await isActionRateLimited("action", session.user.id))
    return { ok: false, error: "Too many updates. Please try again later." };

  const parsed = updateEventSlugSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { organisationSlug, eventId, slug } = parsed.data;
  const org = await prisma.organisation.findUnique({
    where: { slug: organisationSlug },
    select: { id: true, slug: true },
  });
  if (!org) return { ok: false, error: "Organisation not found." };

  const membership = await getMembership(session.user.id, org.id);
  if (!canCreateEvent(membership)) {
    return { ok: false, error: "You do not have permission to edit events." };
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, organisationId: org.id },
    select: { id: true, slug: true },
  });
  if (!event) return { ok: false, error: "Event not found." };

  if (event.slug === slug) {
    return { ok: true, data: { slug } };
  }

  const exists = await prisma.event.findUnique({
    where: { organisationId_slug: { organisationId: org.id, slug } },
    select: { id: true },
  });
  if (exists) {
    return {
      ok: false,
      error: "That URL is already taken for this organisation.",
      fieldErrors: { slug: ["Already taken"] },
    };
  }

  try {
    await prisma.event.update({ where: { id: event.id }, data: { slug } });
    await recordAuditEvent({
      action: "EVENT_SLUG_UPDATED",
      actorUserId: session.user.id,
      organisationId: org.id,
      targetType: "Event",
      targetId: event.id,
    });
    // Revalidate both old and new public URLs + dashboard.
    revalidateEventPaths(org.slug, event.slug, event.id);
    revalidateEventPaths(org.slug, slug, event.id);
    return { ok: true, data: { slug } };
  } catch {
    console.error("[event] deletion failed");
    return { ok: false, error: "Could not update event URL." };
  }
}

export async function cloneEvent(
  input: unknown,
): Promise<ActionResult<{ eventId: string; }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }
  if (!(await isUserEmailVerified(session.user.id))) {
    return { ok: false, error: "Verify your email before creating events." };
  }
  if (await isActionRateLimited("create", session.user.id))
    return {
      ok: false,
      error: "Too many creation attempts. Please try again later.",
    };

  const parsed = cloneEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { organisationSlug, eventId } = parsed.data;
  const org = await prisma.organisation.findUnique({
    where: { slug: organisationSlug },
    select: { id: true, slug: true },
  });
  if (!org) return { ok: false, error: "Organisation not found." };

  const membership = await getMembership(session.user.id, org.id);
  if (!canCreateEvent(membership)) {
    return { ok: false, error: "Only owners and admins can create events." };
  }

  const source = await prisma.event.findFirst({
    where: { id: eventId, organisationId: org.id },
  });
  if (!source) return { ok: false, error: "Event not found." };

  const newTitle = `${source.title} (copy)`;
  const baseSlug = slugifyTitle(newTitle);
  let slug = baseSlug;
  let attempt = 0;
  while (
    isReservedEventSlug(slug) ||
    await prisma.event.findUnique({
      where: { organisationId_slug: { organisationId: org.id, slug } },
      select: { id: true },
    })
  ) {
    attempt += 1;
    if (attempt > 50) {
      return { ok: false, error: "Could not generate a unique URL slug." };
    }
    slug = withSlugSuffix(baseSlug, attempt);
  }

  try {
    const created = await prisma.event.create({
      data: {
        organisationId: org.id,
        title: newTitle,
        slug,
        description: source.description ?? "",
        coverImageUrl: source.coverImageUrl,
        startDateTime: source.startDateTime,
        endDateTime: source.endDateTime,
        timezone: source.timezone,
        location: source.location ?? "",
        mapLinkUrl: source.mapLinkUrl,
        isOnline: source.isOnline,
        capacity: source.capacity,
        // Clone as draft to prevent accidental double-publishing.
        status: EventStatus.DRAFT,
        privacyType: source.privacyType,
        listedPublicly: source.listedPublicly,
      },
    });

    await recordAuditEvent({
      action: "EVENT_CLONED",
      actorUserId: session.user.id,
      organisationId: org.id,
      targetType: "Event",
      targetId: created.id,
      metadata: { sourceEventId: source.id },
    });

    revalidateEventPaths(org.slug, created.slug, created.id);
    return { ok: true, data: { eventId: created.id } };
  } catch {
    console.error("[event] clone failed");
    return { ok: false, error: "Could not clone event." };
  }
}

export async function publishEvent(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }
  if (await isActionRateLimited("action", session.user.id))
    return { ok: false, error: "Too many updates. Please try again later." };
  const parsed = publishEventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid publish request." };

  const org = await prisma.organisation.findUnique({
    where: { slug: parsed.data.organisationSlug },
  });
  if (!org) return { ok: false, error: "Organisation not found." };

  const membership = await getMembership(session.user.id, org.id);
  if (!canPublishEvents(membership)) {
    return { ok: false, error: "Only owners and admins can publish." };
  }

  const event = await prisma.event.findUnique({
    where: {
      organisationId_slug: {
        organisationId: org.id,
        slug: parsed.data.eventSlug,
      },
    },
  });
  if (!event) return { ok: false, error: "Event not found." };

  // Website visibility follows the event's published status, as in the event
  // form; without the release a published event's public page stays 404.
  await prisma.$transaction([
    prisma.event.update({
      where: { id: event.id },
      data: { status: EventStatus.PUBLISHED },
    }),
    prisma.eventPage.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, isPublished: true },
      update: { isPublished: true },
    }),
  ]);

  await recordAuditEvent({
    action: "EVENT_PUBLISHED",
    actorUserId: session.user.id,
    organisationId: org.id,
    targetType: "Event",
    targetId: event.id,
  });

  revalidateEventPaths(org.slug, event.slug, event.id);
  return { ok: true };
}

const cancelEventSchema = z.object({
  organisationSlug: z.string().trim().min(1).max(120),
  eventId: z.string().trim().min(1).max(128),
  reason: z.string().trim().max(500).default(""),
}).strict();

/**
 * Cancel an event: it stops taking registrations and shows as cancelled,
 * everyone who paid is refunded in full (and emailed), and everyone with a
 * free place is told. Owners and admins only. Running it again only finishes
 * what's left, so nobody is refunded twice.
 */
export async function cancelEvent(input: unknown): Promise<ActionResult<{ refunded: number; failed: number; notified: number; }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many updates. Please try again later." };
  const parsed = cancelEventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose an event to cancel." };
  const org = await prisma.organisation.findUnique({ where: { slug: parsed.data.organisationSlug } });
  if (!org) return { ok: false, error: "Organisation not found." };
  if (!canPublishEvents(await getMembership(session.user.id, org.id))) return { ok: false, error: "Only owners and admins can cancel events." };
  const event = await prisma.event.findFirst({ where: { id: parsed.data.eventId, organisationId: org.id }, select: { id: true, slug: true, title: true, status: true } });
  if (!event) return { ok: false, error: "Event not found." };

  const notified = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${event.id} FOR UPDATE`;
    if (event.status === EventStatus.CANCELLED) return 0;
    await tx.event.update({ where: { id: event.id }, data: { status: EventStatus.CANCELLED } });
    // Everyone is told here; buyers also hear about their refund.
    const told = await notifyEventCancelled(tx, { organisationId: org.id, eventId: event.id, title: event.title, reason: parsed.data.reason });
    await recordAuditEvent({ action: "EVENT_CANCELLED", actorUserId: session.user!.id, organisationId: org.id, targetType: "Event", targetId: event.id, client: tx });
    return told;
  });
  const result = await refundCancelledEvent({ eventId: event.id, organisationId: org.id, actorUserId: session.user.id });
  revalidateEventPaths(org.slug, event.slug, event.id);
  return { ok: true, data: { ...result, notified } };
}

