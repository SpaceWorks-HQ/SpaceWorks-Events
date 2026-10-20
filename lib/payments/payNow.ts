import "server-only";

import { NextResponse } from "next/server";
import { checkRateLimitById, getClientIpFromHeaders } from "@/lib/rateLimit";
import { startCheckout } from "./checkout";

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

const MESSAGES = {
  hold_ended: "These tickets are no longer held. Order again if tickets are left.",
  hold_ending: "Your hold is about to end, so a new payment page can't open. Order again in a moment.",
  busy: "The payment page is still opening. Try again in a few seconds.",
  unavailable: "The payment page couldn't be opened. Try again in a moment.",
} as const;

/**
 * "Pay now" for an order still held. The bearer token (order or ticket) is
 * the proof, as for the pages it comes from. Returns only the hosted
 * checkout address.
 */
export async function payNowResponse(request: Request, orderId: string | null) {
  if (!(await checkRateLimitById("ticketCheckout", `ip:${getClientIpFromHeaders(request.headers)}`))) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again shortly." }, { status: 429, headers: { ...HEADERS, "Retry-After": "60" } });
  }
  if (!orderId) return NextResponse.json({ ok: false }, { status: 404, headers: HEADERS });
  const outcome = await startCheckout(orderId).catch(() => ({ error: "unavailable" as const }));
  if ("url" in outcome) return NextResponse.json({ ok: true, url: outcome.url }, { headers: HEADERS });
  const status = outcome.error === "busy" || outcome.error === "unavailable" ? 503 : 409;
  return NextResponse.json({ ok: false, error: MESSAGES[outcome.error] }, { status, headers: HEADERS });
}

/** Order access tokens are cuid2 values. */
export function parseOrderToken(raw: string) {
  const token = raw.trim();
  return /^[a-z0-9]{20,40}$/.test(token) ? token : null;
}
