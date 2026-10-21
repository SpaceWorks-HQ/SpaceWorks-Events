import { beforeEach, describe, expect, it } from "vitest";
import { createMfaProof, hasValidMfaProof, MFA_PROOF_MAX_AGE_SECONDS } from "@/lib/mfaProof";

describe("MFA step-up proof", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "unit-test-auth-secret-with-at-least-32-characters";
  });

  it("accepts a proof only for the verified user and session version", () => {
    const now = 1_000_000;
    const proof = createMfaProof("user_1", 3, now);
    expect(hasValidMfaProof(proof, "user_1", 3, now + 1)).toBe(true);
    expect(hasValidMfaProof(proof, "user_2", 3, now + 1)).toBe(false);
    expect(hasValidMfaProof(proof, "user_1", 4, now + 1)).toBe(false);
  });

  it("rejects tampered and expired proofs", () => {
    const now = 1_000_000;
    const proof = createMfaProof("user_1", 3, now);
    expect(hasValidMfaProof(`${proof}x`, "user_1", 3, now + 1)).toBe(false);
    expect(hasValidMfaProof(proof, "user_1", 3, now + MFA_PROOF_MAX_AGE_SECONDS * 1000)).toBe(false);
  });
});
