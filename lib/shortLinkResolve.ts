import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { EventStatus } from "@prisma/client";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { prisma } from "@/lib/db";
import { isShortCodeShape } from "@/lib/shortLink";
import { localDateKey } from "@/components/event-dashboard/analytics/metrics";

/**
 * The canonical public path for an event short code, or null when the code is
 * malformed, unknown, or points at an event whose public page is not live.
 *
 * Only the public status rule is mirrored here (published event with a
 * released website, as `resolvePublicEventAccess` requires for anonymous
 * visitors), so a short code never reveals the slug of a draft, hidden,
 * cancelled, or unreleased event. Audience rules (invite-only, approval) are
 * deliberately left to the destination page, which enforces its own access.
 */
export async function resolveShortCode(code: string): Promise<string | null> {
  return (await findShortLinkEvent(code))?.path ?? null;
}

async function findShortLinkEvent(code: string): Promise<{ id: string; timezone: string; path: string } | null> {
  if (!isShortCodeShape(code)) return null;
  const event = await prisma.event.findUnique({
    where: { shortCode: code },
    select: {
      id: true,
      slug: true,
      timezone: true,
      status: true,
      organisation: { select: { slug: true } },
      page: { select: { isPublished: true } },
    },
  });
  if (!event || event.status !== EventStatus.PUBLISHED || event.page?.isPublished !== true) return null;
  return { id: event.id, timezone: event.timezone, path: `/${event.organisation.slug}/${event.slug}` };
}

/** Link previews (chat apps, social sites), crawlers and scripts open links without a person. */
const AUTOMATED_AGENT = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|telegram|discord|skype|linkedin|embedly|vkshare|curl|wget|python|headless|lighthouse/i;

/** Whether this request is a person opening the link (not a prefetch or a preview fetcher). */
export function isPersonVisit(requestHeaders: Pick<Headers, "get">): boolean {
  const purpose = `${requestHeaders.get("sec-purpose") ?? ""} ${requestHeaders.get("purpose") ?? ""}`.toLowerCase();
  if (purpose.includes("prefetch") || requestHeaders.get("next-router-prefetch")) return false;
  const agent = requestHeaders.get("user-agent") ?? "";
  return agent.length > 0 && !AUTOMATED_AGENT.test(agent);
}

/**
 * Adds one to the event's visit count for today (in the event's timezone).
 * Only the number is stored: never an address, browser, referrer or person.
 */
export async function recordShortLinkVisit(eventId: string, timeZone: string, now = new Date()) {
  const day = localDateKey(now, timeZone);
  await prisma.$executeRaw`
    INSERT INTO "ShortLinkClickDay" ("eventId", "day", "count") VALUES (${eventId}, ${day}::date, 1)
    ON CONFLICT ("eventId", "day") DO UPDATE SET "count" = "ShortLinkClickDay"."count" + 1`;
}

/**
 * Per-request short-link lookup for a root path segment that matched no
 * organisation. Rate limited by client IP before touching the database; a
 * limited request resolves to null so it is indistinguishable from an unknown
 * code. Memoised per request so the layout and page share one limiter hit and
 * one visit count.
 */
export const resolveShortLinkSegment = cache(async (segment: string): Promise<string | null> => {
  if (!isShortCodeShape(segment)) return null;
  if (await isActionRateLimited("shortLink")) return null;
  const event = await findShortLinkEvent(segment);
  if (!event) return null;
  // Counting is analytics only: a failure never blocks the redirect.
  if (isPersonVisit(await headers())) await recordShortLinkVisit(event.id, event.timezone).catch(() => undefined);
  return event.path;
});
