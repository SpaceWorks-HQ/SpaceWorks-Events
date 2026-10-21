import "server-only";

import crypto from "crypto";

/**
 * Proof that this session passed an authenticator check after a sign-in that
 * had none (Google). A signed HttpOnly cookie bound to the user and session
 * version, so signing out everywhere or a password reset ends it at once.
 */
export const MFA_PROOF_COOKIE = "swe.mfa-proof.v1";
export const MFA_PROOF_MAX_AGE_SECONDS = 12 * 60 * 60;

type MfaProofPayload = {
  userId: string;
  sessionVersion: number;
  expiresAt: number;
};

function signingKey() {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 32) throw new Error("AUTH_SECRET must be configured before verifying MFA.");
  return secret;
}

function signature(payload: string) {
  return crypto.createHmac("sha256", signingKey()).update(`mfa-proof:${payload}`).digest("base64url");
}

export function createMfaProof(userId: string, sessionVersion: number, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    userId,
    sessionVersion,
    expiresAt: now + MFA_PROOF_MAX_AGE_SECONDS * 1000,
  } satisfies MfaProofPayload)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function hasValidMfaProof(
  value: string | undefined,
  userId: string,
  sessionVersion: number,
  now = Date.now(),
) {
  if (!value) return false;
  const [payload, providedSignature, ...extra] = value.split(".");
  if (!payload || !providedSignature || extra.length > 0) return false;
  const expectedSignature = signature(payload);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as MfaProofPayload;
    return decoded.userId === userId && decoded.sessionVersion === sessionVersion && Number.isSafeInteger(decoded.expiresAt) && decoded.expiresAt > now;
  } catch {
    return false;
  }
}
