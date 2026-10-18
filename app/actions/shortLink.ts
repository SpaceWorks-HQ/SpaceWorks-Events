"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageEvents, getMembership } from "@/lib/permissions";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import { generateShortCode } from "@/lib/shortLink";

/*
 * Event short links (`/aB3x9Kq`). Created only on request by an organisation
 * OWNER/ADMIN — the same gate as changing the event's public URL slug
 * (updateEventSlug), because a short link is another public address for the
 * event. Event collaborators are not allowed, whatever their EventPermission.
 */

const MAX_ATTEMPTS = 5;

const shortLinkSchema = z
  .object({
    organisationSlug: z.string().trim().min(1).max(120),
    eventId: z.string().trim().min(1).max(64),
  })
  .strict();

export type ShortLinkResult = { ok: true; code: string } | { ok: false; error: string };

type ManageableEvent = { orgId: string; orgSlug: string; userId: string; event: { id: string; shortCode: string | null } };

async function resolveManageableEvent(input: unknown): Promise<ManageableEvent | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };
  if (await isActionRateLimited("action", session.user.id)) return { error: "Too many updates. Please try again later." };

  const parsed = shortLinkSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };

  const org = await prisma.organisation.findUnique({
    where: { slug: parsed.data.organisationSlug },
    select: { id: true, slug: true },
  });
  if (!org) return { error: "Event not found." };

  const membership = await getMembership(session.user.id, org.id);
  if (!canManageEvents(membership)) return { error: "Only organisation owners and admins can manage short links." };

  const event = await prisma.event.findFirst({
    where: { id: parsed.data.eventId, organisationId: org.id },
    select: { id: true, shortCode: true },
  });
  if (!event) return { error: "Event not found." };

  return { orgId: org.id, orgSlug: org.slug, userId: session.user.id, event };
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

/**
 * Writes a fresh code, retrying on the (rare) unique-constraint collision.
 * `onlyIfUnset` makes the write conditional so concurrent creates cannot
 * overwrite each other; it returns null when another request won the race.
 */
async function writeNewCode(eventId: string, organisationId: string, onlyIfUnset: boolean): Promise<string | null | "failed"> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = generateShortCode();
    try {
      const updated = await prisma.event.updateMany({
        where: { id: eventId, organisationId, ...(onlyIfUnset ? { shortCode: null } : {}) },
        data: { shortCode: code },
      });
      return updated.count === 1 ? code : null;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return "failed";
}

function revalidate(orgSlug: string, eventId: string) {
  revalidatePath(`/dashboard/${orgSlug}/event/${eventId}`);
}

/** Creates the event's short link, or returns the existing one (idempotent). */
export async function createEventShortLink(input: unknown): Promise<ShortLinkResult> {
  const resolved = await resolveManageableEvent(input);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const { orgId, orgSlug, userId, event } = resolved;
  if (event.shortCode) return { ok: true, code: event.shortCode };

  try {
    const written = await writeNewCode(event.id, orgId, true);
    if (written === "failed") return { ok: false, error: "Could not create a short link. Please try again." };
    if (written === null) {
      // A concurrent request created it first (or the event vanished).
      const current = await prisma.event.findFirst({ where: { id: event.id, organisationId: orgId }, select: { shortCode: true } });
      return current?.shortCode ? { ok: true, code: current.shortCode } : { ok: false, error: "Event not found." };
    }
    await recordAuditEvent({ action: "EVENT_SHORT_LINK_CREATED", actorUserId: userId, organisationId: orgId, targetType: "Event", targetId: event.id });
    revalidate(orgSlug, event.id);
    return { ok: true, code: written };
  } catch {
    console.error("[shortLink] create failed");
    return { ok: false, error: "Could not create a short link. Please try again." };
  }
}

/** Replaces the event's short link with a new code; the old code stops working. */
export async function regenerateEventShortLink(input: unknown): Promise<ShortLinkResult> {
  const resolved = await resolveManageableEvent(input);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const { orgId, orgSlug, userId, event } = resolved;

  try {
    const written = await writeNewCode(event.id, orgId, false);
    if (written === "failed") return { ok: false, error: "Could not create a new short link. Please try again." };
    if (written === null) return { ok: false, error: "Event not found." };
    await recordAuditEvent({
      action: event.shortCode ? "EVENT_SHORT_LINK_REGENERATED" : "EVENT_SHORT_LINK_CREATED",
      actorUserId: userId,
      organisationId: orgId,
      targetType: "Event",
      targetId: event.id,
    });
    revalidate(orgSlug, event.id);
    return { ok: true, code: written };
  } catch {
    console.error("[shortLink] regenerate failed");
    return { ok: false, error: "Could not create a new short link. Please try again." };
  }
}
