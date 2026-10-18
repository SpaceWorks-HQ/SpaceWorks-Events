import "server-only";

import { cache } from "react";
import { EventStatus } from "@prisma/client";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { prisma } from "@/lib/db";
import { isShortCodeShape } from "@/lib/shortLink";

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
  if (!isShortCodeShape(code)) return null;
  const event = await prisma.event.findUnique({
    where: { shortCode: code },
    select: {
      slug: true,
      status: true,
      organisation: { select: { slug: true } },
      page: { select: { isPublished: true } },
    },
  });
  if (!event || event.status !== EventStatus.PUBLISHED || event.page?.isPublished !== true) return null;
  return `/${event.organisation.slug}/${event.slug}`;
}

/**
 * Per-request short-link lookup for a root path segment that matched no
 * organisation. Rate limited by client IP before touching the database; a
 * limited request resolves to null so it is indistinguishable from an unknown
 * code. Memoised per request so the layout and page share one limiter hit.
 */
export const resolveShortLinkSegment = cache(async (segment: string): Promise<string | null> => {
  if (!isShortCodeShape(segment)) return null;
  if (await isActionRateLimited("shortLink")) return null;
  return resolveShortCode(segment);
});
