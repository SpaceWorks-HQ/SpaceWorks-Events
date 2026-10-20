import "server-only";

import crypto from "crypto";
import { deriveSecretKey } from "@/lib/instanceConfigSecrets";

/**
 * Where the provider sends the buyer after checkout. The order's access token
 * is a bearer capability, so it is never handed to Razorpay or Stripe: the
 * provider gets a signed, expiring link to /api/payments/return/:orderId that
 * redirects to the order page.
 */
const RETURN_LINK_LIFETIME_MS = 24 * 60 * 60_000;

function signature(orderId: string, expiresAt: number) {
  return crypto.createHmac("sha256", deriveSecretKey("spaceworks-events-payment-return-v1")).update(`${orderId}.${expiresAt}`).digest("base64url");
}

export function paymentReturnUrl(baseUrl: string, orderId: string, now = Date.now()) {
  const expiresAt = Math.floor((now + RETURN_LINK_LIFETIME_MS) / 1000);
  return `${baseUrl.replace(/\/$/, "")}/api/payments/return/${encodeURIComponent(orderId)}?e=${expiresAt}&s=${signature(orderId, expiresAt)}`;
}

export function verifyPaymentReturn(orderId: string, expires: string | null, provided: string | null, now = Date.now()) {
  if (!/^[a-z0-9]{20,40}$/.test(orderId) || !expires || !/^\d{1,12}$/.test(expires) || !provided) return false;
  const expiresAt = Number(expires);
  if (expiresAt * 1000 < now) return false;
  const expected = Buffer.from(signature(orderId, expiresAt));
  const received = Buffer.from(provided);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
