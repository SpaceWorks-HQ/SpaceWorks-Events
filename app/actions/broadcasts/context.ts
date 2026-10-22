import { prisma } from "@/lib/db";
import { canManageEvents, getMembership } from "@/lib/permissions";
import { sanitizeBroadcastHtml } from "@/lib/eventBroadcast";
import { broadcastHtmlToText } from "@/lib/broadcastTemplate";

export type BroadcastContext =
  | { ok: false; error: string; }
  | { ok: true; org: { id: string; slug: string; }; event: { id: string; title: string; }; };

/**
 * Broadcasts are organisation-admin operations, like every other RSVP
 * lifecycle action: they reveal who registered and email attendees in bulk.
 * `getMembership` also applies the staff authenticator check, so a staff
 * member who has not passed it this session gets no access. The composer,
 * its drafts, and the send all go through this one check.
 */
export async function requireBroadcastContext(userId: string, organisationSlug: string, eventId: string): Promise<BroadcastContext> {
  const org = await prisma.organisation.findUnique({ where: { slug: organisationSlug }, select: { id: true, slug: true } });
  if (!org) return { ok: false, error: "Organisation not found." };
  const membership = await getMembership(userId, org.id);
  if (!canManageEvents(membership)) return { ok: false, error: "You do not have permission to email attendees." };
  const event = await prisma.event.findFirst({ where: { id: eventId, organisationId: org.id }, select: { id: true, title: true } });
  if (!event) return { ok: false, error: "Event not found." };
  return { ok: true, org, event };
}

/** Editor output is reduced to the supported subset; an empty result means the organiser only entered formatting. */
export function cleanBody(body: string): { ok: true; body: string; } | { ok: false; error: string; } {
  const sanitized = sanitizeBroadcastHtml(body);
  if (!broadcastHtmlToText(sanitized).trim()) return { ok: false, error: "The message is empty." };
  return { ok: true, body: sanitized };
}
