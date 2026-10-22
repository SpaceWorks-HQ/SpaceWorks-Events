import "server-only";

import crypto from "crypto";

/**
 * A saved secret that cannot be decrypted with the current key. The name and
 * code survive describeOperationalError, so outbox lastError and operator UIs
 * show this cause rather than a generic crypto failure.
 */
export class InstanceSecretUnreadableError extends Error {
  override name = "InstanceSecretUnreadableError";
  code = "ESECRETUNREADABLE";

  constructor() {
    super("A setting saved in Super admin → Settings cannot be decrypted with this MFA_ENCRYPTION_KEY (it differs between replicas or was rotated); restore the key or re-enter the secret.");
  }
}

/**
 * A 32-byte subkey of MFA_ENCRYPTION_KEY for one purpose. Each `info` string
 * yields an unrelated key, so ciphertext from one domain never decrypts in
 * another.
 */
export function deriveSecretKey(info: string) {
  const raw = process.env.MFA_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) {
    throw new Error("MFA_ENCRYPTION_KEY must be valid base64 for a 32-byte key.");
  }
  // A domain-separated subkey prevents configuration ciphertext from being
  // interchangeable with MFA seed ciphertext.
  return Buffer.from(crypto.hkdfSync("sha256", key, Buffer.alloc(0), info, 32));
}

function encryptionKey() {
  return deriveSecretKey("yuyu-instance-service-settings-v1");
}

export function encryptInstanceConfigSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptInstanceConfigSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new InstanceSecretUnreadableError();
  // A missing or malformed key is a configuration error and keeps its own message.
  const key = encryptionKey();
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new InstanceSecretUnreadableError();
  }
}
