"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { canUseBadges } from "@/lib/badge/access";
import { badgeBrandingFor, badgeDesignFor, loadBadgeAttendee, loadBadgeEvent, type BadgeDesignState } from "@/lib/badge/data";
import type { BadgeBranding } from "@/lib/badge/types";
import { prisma } from "@/lib/db";
import { BADGE_DESIGN_MAX_BYTES, normalizeIdCardPrintSettings } from "@/lib/idCardPrint";
import type { ActionResult } from "./org";

const eventInput = z.object({
  organisationSlug: z.string().trim().min(1).max(120),
  eventId: z.string().trim().min(1).max(128),
}).strict();

const saveInput = eventInput.extend({
  settings: z.record(z.string(), z.unknown()),
}).strict();

const photoInput = eventInput.extend({
  rsvpId: z.string().trim().min(1).max(128),
}).strict();

const NOT_FOUND = "Event not found.";

/**
 * Resolve the event from the organisation in the URL and check the caller may
 * run its check-in desk. Another organisation's event is "not found".
 */
async function requireBadgeEvent(organisationSlug: string, eventId: string) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "You must be signed in." };
  const userId = session.user.id;
  if (await isActionRateLimited("action", userId)) return { ok: false as const, error: "Too many requests. Please try again shortly." };
  const organisation = await prisma.organisation.findUnique({ where: { slug: organisationSlug }, select: { id: true } });
  if (!organisation) return { ok: false as const, error: NOT_FOUND };
  const event = await loadBadgeEvent(eventId);
  if (!event || event.organisationId !== organisation.id) return { ok: false as const, error: NOT_FOUND };
  if (!(await canUseBadges(userId, event))) return { ok: false as const, error: "You don't have permission to manage badges for this event." };
  return { ok: true as const, userId, event };
}

/** The saved design (or the default) and the event's artwork. */
export async function getBadgeDesign(input: unknown): Promise<ActionResult<BadgeDesignState & { branding: BadgeBranding }>> {
  const parsed = eventInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const context = await requireBadgeEvent(parsed.data.organisationSlug, parsed.data.eventId);
  if (!context.ok) return { ok: false, error: context.error };
  return { ok: true, data: { ...badgeDesignFor(context.event), branding: badgeBrandingFor(context.event) } };
}

/** Save the event's badge design. It is size-limited and normalised before it is stored. */
export async function saveBadgeDesign(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That badge design couldn't be read." };
  if (Buffer.byteLength(JSON.stringify(parsed.data.settings), "utf8") > BADGE_DESIGN_MAX_BYTES) {
    return { ok: false, error: "That badge design is too large to save." };
  }
  const context = await requireBadgeEvent(parsed.data.organisationSlug, parsed.data.eventId);
  if (!context.ok) return { ok: false, error: context.error };
  const { event, userId } = context;
  const settings = normalizeIdCardPrintSettings(parsed.data.settings, event.title, event.organisation.name);
  const saved = await prisma.eventBadgeDesign.upsert({
    where: { eventId: event.id },
    create: { eventId: event.id, settings, updatedById: userId },
    update: { settings, updatedById: userId },
    select: { updatedAt: true },
  });
  return { ok: true, data: { updatedAt: saved.updatedAt.toISOString() } };
}

/** The attendee's uploaded profile photo for the badge, if they have one. */
export async function getBadgeAttendeePhoto(input: unknown): Promise<ActionResult<{ photoUrl: string | null }>> {
  const parsed = photoInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const context = await requireBadgeEvent(parsed.data.organisationSlug, parsed.data.eventId);
  if (!context.ok) return { ok: false, error: context.error };
  const attendee = await loadBadgeAttendee(context.event.id, parsed.data.rsvpId);
  if (!attendee) return { ok: false, error: "Attendee not found." };
  return { ok: true, data: { photoUrl: attendee.photoUrl ?? null } };
}
