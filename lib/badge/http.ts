import "server-only";

import { auth } from "@/lib/auth";
import { checkRateLimitById } from "@/lib/rateLimit";
import { canUseBadges } from "./access";
import { loadBadgeEvent } from "./data";

/** Shared pieces of the badge download routes. */

export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

/** Unauthorised, other-organisation and unknown requests all look the same. */
export function notFound() {
  return new Response(null, { status: 404, headers: PRIVATE_HEADERS });
}

export function jsonError(status: number, error: string) {
  return Response.json({ ok: false, error }, { status, headers: PRIVATE_HEADERS });
}

/** Session, event and check-in permission for a badge download. Null means "respond 404". */
export async function authorizeBadgeDownload(eventId: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || eventId.length > 128) return null;
  const event = await loadBadgeEvent(eventId);
  if (!event || !(await canUseBadges(userId, event))) return null;
  return { userId, event };
}

export function badgeRateLimited(userId: string) {
  return checkRateLimitById("checkin", `badges:${userId}`).then((allowed) => !allowed);
}

export function slugForFile(value: string, fallback: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || fallback;
}

export function download(body: Uint8Array | Buffer, contentType: string, filename: string) {
  return new Response(body as unknown as BodyInit, {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
