import "server-only";

import { prisma } from "@/lib/db";

/** Same opaque-token shape check as the ticket page and ticket download. */
const TICKET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export const TICKET_STATE_BASE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

export type TicketCheckInState = { checkedIn: boolean; checkedInAt: string | null };

export function parseTicketToken(raw: string): string | null {
  const token = raw.trim();
  return TICKET_TOKEN_PATTERN.test(token) ? token : null;
}

/** Resolve a validated ticket token to the minimum needed for check-in state. */
export async function findTicketCheckIn(token: string): Promise<{ rsvpId: string; checkedInAt: Date | null } | null> {
  const rsvp = await prisma.rSVP.findUnique({
    where: { checkInToken: token },
    select: { id: true, checkedInAt: true },
  });
  return rsvp ? { rsvpId: rsvp.id, checkedInAt: rsvp.checkedInAt } : null;
}

export function toTicketCheckInState(checkedInAt: Date | null): TicketCheckInState {
  return { checkedIn: checkedInAt !== null, checkedInAt: checkedInAt?.toISOString() ?? null };
}

export function emptyTicketResponse(status: 404 | 429 | 503): Response {
  return new Response(null, {
    status,
    headers: status === 404 ? TICKET_STATE_BASE_HEADERS : { ...TICKET_STATE_BASE_HEADERS, "Retry-After": "60" },
  });
}
