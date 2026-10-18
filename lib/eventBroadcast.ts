import "server-only";

import type { BroadcastAttendanceFilter, Prisma, RsvpStatus } from "@prisma/client";
import sanitizeHtml from "sanitize-html";
import { prisma } from "@/lib/db";
import type { BroadcastBrand } from "@/lib/email/broadcastDesigns";
import { formatBroadcastEventDate } from "@/lib/broadcastTemplate";

type BroadcastClient = Prisma.TransactionClient | typeof prisma;

export type BroadcastAudience = {
  statuses: readonly RsvpStatus[];
  attendance: BroadcastAttendanceFilter;
};

/** Database predicate for every registration that belongs to a broadcast audience. */
export function broadcastRecipientWhere(eventId: string, audience: BroadcastAudience): Prisma.RSVPWhereInput {
  return {
    eventId,
    status: { in: [...audience.statuses] },
    ...(audience.attendance === "CHECKED_IN" ? { checkedInAt: { not: null } } : {}),
    ...(audience.attendance === "NOT_CHECKED_IN" ? { checkedInAt: null } : {}),
  };
}

/** Re-evaluated at delivery time so a registration that changed after queuing is not emailed with stale wording. */
export function rsvpMatchesBroadcastAudience(
  rsvp: { status: RsvpStatus; checkedInAt: Date | null },
  audience: BroadcastAudience,
): boolean {
  if (!audience.statuses.includes(rsvp.status)) return false;
  if (audience.attendance === "CHECKED_IN") return rsvp.checkedInAt !== null;
  if (audience.attendance === "NOT_CHECKED_IN") return rsvp.checkedInAt === null;
  return true;
}

export type BroadcastRecipient = { rsvpId: string; email: string };

/**
 * One recipient per email address. A person who registered as a guest and
 * again with an account would otherwise receive the message twice. When one
 * of their registrations is confirmed, that one is used, so the email carries
 * their ticket link rather than the event page.
 */
export async function resolveBroadcastRecipients(
  client: BroadcastClient,
  eventId: string,
  audience: BroadcastAudience,
): Promise<BroadcastRecipient[]> {
  const rsvps = await client.rSVP.findMany({
    where: broadcastRecipientWhere(eventId, audience),
    select: { id: true, status: true, guestEmail: true, user: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const byEmail = new Map<string, BroadcastRecipient & { confirmed: boolean }>();
  for (const rsvp of rsvps) {
    const email = (rsvp.user?.email ?? rsvp.guestEmail ?? "").trim().toLowerCase();
    if (!email) continue;
    const confirmed = rsvp.status === "CONFIRMED";
    const existing = byEmail.get(email);
    if (existing && (existing.confirmed || !confirmed)) continue;
    // Map insertion order is kept on replacement, so recipients stay in registration order.
    byEmail.set(email, { rsvpId: rsvp.id, email, confirmed });
  }
  return [...byEmail.values()].map(({ rsvpId, email }) => ({ rsvpId, email }));
}

export function getBroadcastBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function broadcastEventUrl(orgSlug: string, eventSlug: string): string {
  return `${getBroadcastBaseUrl()}/${encodeURIComponent(orgSlug)}/${encodeURIComponent(eventSlug)}`;
}

export function broadcastTicketUrl(checkInToken: string): string {
  return `${getBroadcastBaseUrl()}/ticket/${encodeURIComponent(checkInToken)}`;
}

export function broadcastFeedbackUrl(orgSlug: string, eventSlug: string): string {
  return `${broadcastEventUrl(orgSlug, eventSlug)}/feedback`;
}

export function broadcastScheduleUrl(orgSlug: string, eventSlug: string): string {
  return `${broadcastEventUrl(orgSlug, eventSlug)}/schedule`;
}

const HREF_PLACEHOLDER = /href="\{\{\s*(ticketLink|eventUrl|feedbackUrl|scheduleUrl)\s*\}\}"/g;
const HREF_SENTINEL = /href="https:\/\/placeholder\.invalid\/(ticketLink|eventUrl|feedbackUrl|scheduleUrl)"/g;

/**
 * Reduce editor output to the small HTML subset the email template supports.
 * Link placeholders are swapped for a sentinel URL while sanitising so the
 * allowed-scheme check keeps them, then restored for delivery-time rendering.
 */
export function sanitizeBroadcastHtml(html: string): string {
  const protectedHtml = html.replace(HREF_PLACEHOLDER, (_match, key: string) => `href="https://placeholder.invalid/${key}"`);
  const clean = sanitizeHtml(protectedHtml, {
    allowedTags: ["p", "br", "strong", "em", "s", "u", "h2", "h3", "ul", "ol", "li", "blockquote", "a"],
    allowedAttributes: { a: ["href", "class"] },
    allowedClasses: { a: ["cta"] },
    allowedSchemes: ["http", "https", "mailto"],
  }).trim();
  return clean
    .replace(HREF_SENTINEL, (_match, key: string) => `href="{{${key}}}"`)
    // sanitize-html keeps relative targets; a typo like {{nope}} would become a broken relative link.
    .replace(/<a\b([^>]*?)\s*href="([^"]*)"([^>]*)>/g, (match, before: string, href: string, after: string) =>
      // URL schemes are case-insensitive (the editor accepts HTTPS://…); placeholder names are not.
      /^(https?:\/\/|mailto:)/i.test(href) || /^\{\{(ticketLink|eventUrl|feedbackUrl|scheduleUrl)\}\}$/.test(href) ? match : `<a${before}${after}>`);
}

/** Fields a broadcast design may use, selected alongside the event. */
export const broadcastBrandSelect = {
  coverImageUrl: true,
  page: { select: { accentColor: true } },
} as const;

/** Event branding for a broadcast design: accent, cover, organisation logo, date line and link. */
export function broadcastBrandFor(event: {
  slug: string;
  startDateTime: Date;
  timezone: string;
  coverImageUrl: string | null;
  page: { accentColor: string | null } | null;
  organisation: { slug: string; logoUrl: string | null };
}): BroadcastBrand {
  return {
    accentColor: event.page?.accentColor ?? null,
    coverImageUrl: event.coverImageUrl,
    logoUrl: event.organisation.logoUrl,
    dateLine: formatBroadcastEventDate(event.startDateTime, event.timezone),
    eventUrl: broadcastEventUrl(event.organisation.slug, event.slug),
  };
}
