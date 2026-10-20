import "server-only";

import crypto from "crypto";
import { deriveSecretKey } from "@/lib/instanceConfigSecrets";

/** Columns of OrganisationPaymentSettings that hold ciphertext. */
export type PaymentSecretField =
  | "razorpayKeySecretEncrypted"
  | "razorpayWebhookSecretEncrypted"
  | "stripeSecretKeyEncrypted"
  | "stripeWebhookSecretEncrypted";

const KEY_INFO = "spaceworks-events-organisation-payment-secrets-v1";

/**
 * The organisation and column are bound in as associated data, so a value
 * copied into another organisation's row, or into another column, fails to
 * decrypt instead of becoming that organisation's credential.
 */
function associatedData(organisationId: string, field: PaymentSecretField) {
  return Buffer.from(`${organisationId}\u0000${field}`, "utf8");
}

export function encryptPaymentSecret(organisationId: string, field: PaymentSecretField, value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveSecretKey(KEY_INFO), iv);
  cipher.setAAD(associatedData(organisationId, field));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptPaymentSecret(organisationId: string, field: PaymentSecretField, value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted payment secret.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveSecretKey(KEY_INFO), Buffer.from(iv, "base64url"));
  decipher.setAAD(associatedData(organisationId, field));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
