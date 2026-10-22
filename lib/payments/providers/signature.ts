import "server-only";

import crypto from "crypto";

/** Hex HMAC-SHA256 over the exact bytes received (never a re-serialised body). */
export function hmacSha256Hex(secret: string, ...parts: Array<Buffer | string>) {
  const hmac = crypto.createHmac("sha256", secret);
  for (const part of parts) hmac.update(part);
  return hmac.digest("hex");
}

/**
 * Constant-time comparison of two hex digests. Compared as bytes so a header
 * with odd characters is a plain mismatch rather than an exception.
 */
export function safeEqualHex(expected: string, received: string) {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
