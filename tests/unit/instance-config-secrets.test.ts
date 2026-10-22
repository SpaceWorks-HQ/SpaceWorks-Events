import crypto from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeOperationalError } from "@/lib/redactSensitiveText";
import { decryptInstanceConfigSecret, encryptInstanceConfigSecret, InstanceSecretUnreadableError } from "@/lib/instanceConfigSecrets";

const keyA = crypto.randomBytes(32).toString("base64");
const keyB = crypto.randomBytes(32).toString("base64");

describe("instance configuration secrets", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips with the same key", () => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", keyA);
    expect(decryptInstanceConfigSecret(encryptInstanceConfigSecret("fixture-secret"))).toBe("fixture-secret");
  });

  it("throws a named, operator-readable error for a different or rotated key", () => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", keyA);
    const encrypted = encryptInstanceConfigSecret("fixture-secret");
    vi.stubEnv("MFA_ENCRYPTION_KEY", keyB);
    let error: unknown;
    try {
      decryptInstanceConfigSecret(encrypted);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(InstanceSecretUnreadableError);
    expect((error as Error).message).toContain("MFA_ENCRYPTION_KEY");
    expect(describeOperationalError(error)).toBe("InstanceSecretUnreadableError (ESECRETUNREADABLE)");
  });

  it("treats malformed ciphertext as unreadable", () => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", keyA);
    expect(() => decryptInstanceConfigSecret("garbage")).toThrow(InstanceSecretUnreadableError);
  });
});
