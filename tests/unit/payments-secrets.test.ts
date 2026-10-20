import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptPaymentSecret, encryptPaymentSecret } from "@/lib/payments/secrets";
import { decryptInstanceConfigSecret, encryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";

const previousKey = process.env.MFA_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

afterEach(() => {
  process.env.MFA_ENCRYPTION_KEY = previousKey;
});

describe("organisation payment secrets", () => {
  it("round-trips without storing the plaintext", () => {
    const ciphertext = encryptPaymentSecret("org_a", "stripeSecretKeyEncrypted", "sk_test_abcdefghijklmnop");
    expect(ciphertext).toMatch(/^v1\./);
    expect(ciphertext).not.toContain("sk_test_");
    expect(decryptPaymentSecret("org_a", "stripeSecretKeyEncrypted", ciphertext)).toBe("sk_test_abcdefghijklmnop");
  });

  it("binds ciphertext to its organisation and column", () => {
    const ciphertext = encryptPaymentSecret("org_a", "razorpayKeySecretEncrypted", "secret-value");
    expect(() => decryptPaymentSecret("org_b", "razorpayKeySecretEncrypted", ciphertext)).toThrow();
    expect(() => decryptPaymentSecret("org_a", "razorpayWebhookSecretEncrypted", ciphertext)).toThrow();
  });

  it("is domain-separated from instance SMTP and Google secrets", () => {
    const payment = encryptPaymentSecret("org_a", "stripeWebhookSecretEncrypted", "whsec_value");
    const instance = encryptInstanceConfigSecret("whsec_value");
    expect(() => decryptInstanceConfigSecret(payment)).toThrow();
    expect(() => decryptPaymentSecret("org_a", "stripeWebhookSecretEncrypted", instance)).toThrow();
  });

  it("refuses a malformed key", () => {
    process.env.MFA_ENCRYPTION_KEY = "short";
    expect(() => encryptPaymentSecret("org_a", "stripeSecretKeyEncrypted", "x")).toThrow(/MFA_ENCRYPTION_KEY/);
  });
});
