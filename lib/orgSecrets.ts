import "server-only";

import crypto from "crypto";
import { deriveSecretKey } from "@/lib/instanceConfigSecrets";

/** Where an organisation's integration secret lives: "<table>.<column>" or a chat channel's id. */
export type OrgSecretSlot = string;

const KEY_INFO = "spaceworks-events-organisation-integration-secrets-v1";

/**
 * The organisation and slot are bound in as associated data, so a value
 * copied into another organisation's row, or into another column, fails to
 * decrypt instead of becoming that organisation's credential.
 */
function associatedData(organisationId: string, slot: OrgSecretSlot) {
  return Buffer.from(`${organisationId}\u0000${slot}`, "utf8");
}

export function encryptOrgSecret(organisationId: string, slot: OrgSecretSlot, value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveSecretKey(KEY_INFO), iv);
  cipher.setAAD(associatedData(organisationId, slot));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptOrgSecret(organisationId: string, slot: OrgSecretSlot, value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted organisation secret.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveSecretKey(KEY_INFO), Buffer.from(iv, "base64url"));
  decipher.setAAD(associatedData(organisationId, slot));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
