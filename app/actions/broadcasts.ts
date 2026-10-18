"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageEvents, getMembership } from "@/lib/permissions";
import { broadcastAudienceSchema, previewEventBroadcastSchema, sendEventBroadcastSchema, sendEventBroadcastTestSchema } from "@/lib/validators";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { broadcastBrandFor, broadcastBrandSelect, broadcastEventUrl, resolveBroadcastRecipients, sanitizeBroadcastHtml } from "@/lib/eventBroadcast";
import { broadcastHtmlToText, renderBroadcastHtml, renderBroadcastTemplate, sampleBroadcastVariables } from "@/lib/broadcastTemplate";
import { buildBroadcastEmail } from "@/lib/email";
import { enqueueEventBroadcastRecipients, enqueueEventBroadcastTest } from "@/lib/outbox";
import { startOutboxWorker } from "@/lib/outboxWorker";

type BroadcastContext =
  | { ok: false; error: string }
  | { ok: true; org: { id: string; slug: string }; event: { id: string; title: string } };

/**
 * Broadcasts are organisation-admin operations, like every other RSVP
 * lifecycle action: they reveal who registered and email attendees in bulk.
 */
async function requireBroadcastContext(userId: string, organisationSlug: string, eventId: string): Promise<BroadcastContext> {
  const org = await prisma.organisation.findUnique({ where: { slug: organisationSlug }, select: { id: true, slug: true } });
  if (!org) return { ok: false, error: "Organisation not found." };
  const membership = await getMembership(userId, org.id);
  if (!canManageEvents(membership)) return { ok: false, error: "You do not have permission to email attendees." };
  const event = await prisma.event.findFirst({ where: { id: eventId, organisationId: org.id }, select: { id: true, title: true } });
  if (!event) return { ok: false, error: "Event not found." };
  return { ok: true, org, event };
}

/** Editor output is reduced to the supported subset; an empty result means the organiser only entered formatting. */
function cleanBody(body: string): { ok: true; body: string } | { ok: false; error: string } {
  const sanitized = sanitizeBroadcastHtml(body);
  if (!broadcastHtmlToText(sanitized).trim()) return { ok: false, error: "The message is empty." };
  return { ok: true, body: sanitized };
}

export async function countBroadcastRecipients(input: unknown): Promise<ActionResult<{ count: number }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const parsed = broadcastAudienceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid audience.", fieldErrors: flattenZodErrors(parsed.error) };

  const context = await requireBroadcastContext(userId, parsed.data.organisationSlug, parsed.data.eventId);
  if (!context.ok) return { ok: false, error: context.error };

  const recipients = await resolveBroadcastRecipients(prisma, context.event.id, parsed.data);
  return { ok: true, data: { count: recipients.length } };
}

/** The exact email a recipient would receive, rendered with example values for the dashboard preview. */
export async function previewEventBroadcast(input: unknown): Promise<ActionResult<{ subject: string; html: string; text: string }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const parsed = previewEventBroadcastSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = flattenZodErrors(parsed.error);
    return { ok: false, error: fieldErrors.subject?.[0] ?? fieldErrors.body?.[0] ?? "Invalid input.", fieldErrors };
  }

  const context = await requireBroadcastContext(userId, parsed.data.organisationSlug, parsed.data.eventId);
  if (!context.ok) return { ok: false, error: context.error };
  const event = await prisma.event.findFirst({
    where: { id: context.event.id },
    select: { title: true, slug: true, startDateTime: true, timezone: true, location: true, isOnline: true, ...broadcastBrandSelect, organisation: { select: { name: true, slug: true, logoUrl: true } } },
  });
  if (!event) return { ok: false, error: "Event not found." };

  const body = cleanBody(parsed.data.body);
  if (!body.ok) return { ok: false, error: body.error };
  const variables = sampleBroadcastVariables({
    title: event.title,
    startDateTime: event.startDateTime,
    timezone: event.timezone,
    location: event.location,
    isOnline: event.isOnline,
    eventUrl: broadcastEventUrl(event.organisation.slug, event.slug),
    organisationName: event.organisation.name,
  });
  const bodyHtml = renderBroadcastHtml(body.body, variables);
  const email = buildBroadcastEmail({
    subject: renderBroadcastTemplate(parsed.data.subject, variables),
    bodyHtml,
    bodyText: broadcastHtmlToText(bodyHtml),
    eventTitle: event.title,
    organisationName: event.organisation.name,
    design: parsed.data.design,
    brand: broadcastBrandFor(event),
    // The preview renders inside this site, so uploaded images load from the page origin.
    imageBaseUrl: "",
  });
  return { ok: true, data: email };
}

export async function sendEventBroadcast(input: unknown): Promise<ActionResult<{ recipientCount: number; broadcastId: string }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (await isActionRateLimited("broadcast", userId)) {
    return { ok: false, error: "Too many emails sent recently. Please wait before sending another broadcast." };
  }
  const parsed = sendEventBroadcastSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = flattenZodErrors(parsed.error);
    return { ok: false, error: fieldErrors.subject?.[0] ?? fieldErrors.body?.[0] ?? fieldErrors.statuses?.[0] ?? "Invalid input.", fieldErrors };
  }

  const context = await requireBroadcastContext(userId, parsed.data.organisationSlug, parsed.data.eventId);
  if (!context.ok) return { ok: false, error: context.error };
  const body = cleanBody(parsed.data.body);
  if (!body.ok) return { ok: false, error: body.error };

  const audience = { statuses: parsed.data.statuses, attendance: parsed.data.attendance };
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Resolve inside the transaction so the stored count and the queued
      // rows describe exactly the same set of registrations.
      const recipients = await resolveBroadcastRecipients(tx, context.event.id, audience);
      if (recipients.length === 0) return null;
      const broadcast = await tx.eventBroadcast.create({
        data: {
          eventId: context.event.id,
          createdByUserId: userId,
          statuses: [...audience.statuses],
          attendance: audience.attendance,
          subject: parsed.data.subject,
          body: body.body,
          design: parsed.data.design,
          recipientCount: recipients.length,
        },
        select: { id: true },
      });
      await enqueueEventBroadcastRecipients(tx, recipients.map((recipient) => ({ to: recipient.email, broadcastId: broadcast.id, rsvpId: recipient.rsvpId })));
      return { broadcastId: broadcast.id, recipientCount: recipients.length };
    });
    if (!result) return { ok: false, error: "No registrations match the selected audience." };

    startOutboxWorker();
    await recordAuditEvent({
      action: "EVENT_BROADCAST_QUEUED",
      actorUserId: userId,
      organisationId: context.org.id,
      targetType: "EventBroadcast",
      targetId: result.broadcastId,
      metadata: {
        eventId: context.event.id,
        recipientCount: result.recipientCount,
        statuses: audience.statuses.join(","),
        attendance: audience.attendance,
      },
    });
    revalidatePath(`/dashboard/${context.org.slug}/event/${context.event.id}`);
    return { ok: true, data: result };
  } catch {
    console.error("[event broadcast] queueing failed");
    return { ok: false, error: "Could not queue the email. Please try again." };
  }
}

export async function sendEventBroadcastTest(input: unknown): Promise<ActionResult<{ to: string }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (await isActionRateLimited("broadcastTest", userId)) {
    return { ok: false, error: "Too many test emails. Please wait a little before sending another." };
  }
  const parsed = sendEventBroadcastTestSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = flattenZodErrors(parsed.error);
    return { ok: false, error: fieldErrors.subject?.[0] ?? fieldErrors.body?.[0] ?? "Invalid input.", fieldErrors };
  }

  const context = await requireBroadcastContext(userId, parsed.data.organisationSlug, parsed.data.eventId);
  if (!context.ok) return { ok: false, error: context.error };
  const body = cleanBody(parsed.data.body);
  if (!body.ok) return { ok: false, error: body.error };

  // Test messages only ever go to the signed-in organiser's own verified inbox.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, name: true } });
  if (!user?.email || !user.emailVerified) return { ok: false, error: "Verify your own email address before sending a test." };

  try {
    await enqueueEventBroadcastTest(prisma, {
      to: user.email,
      eventId: context.event.id,
      subject: parsed.data.subject,
      body: body.body,
      design: parsed.data.design,
      recipientName: user.name?.trim() || undefined,
    });
    startOutboxWorker();
    await recordAuditEvent({
      action: "EVENT_BROADCAST_TEST_SENT",
      actorUserId: userId,
      organisationId: context.org.id,
      targetType: "Event",
      targetId: context.event.id,
    });
    return { ok: true, data: { to: user.email } };
  } catch {
    console.error("[event broadcast] test queueing failed");
    return { ok: false, error: "Could not queue the test email. Please try again." };
  }
}
