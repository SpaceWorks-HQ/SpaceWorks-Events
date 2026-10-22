// Confirms that MFA_ENCRYPTION_KEY in this environment can decrypt the secrets
// already stored in the database: the Super admin -> Settings SMTP password,
// Google client secret, and alert webhook URL; enrolled TOTP seeds; and each
// organisation's own secrets (mail server password, chat channel credentials,
// payment keys, check-in station PINs).
//
// Run it with exactly the environment the application receives (for example
// `node --env-file=/secure/path/swevents.env scripts/check-instance-secrets.mjs`,
// or inside the migrator image/job). A failure means the key differs from the
// one that encrypted the data (rotated, or not identical on every replica/job).
// The application keeps running in that state, but email delivery, Google
// sign-in, alerts, MFA, payments and chat notifications fail at use time.
//
// It never prints a decrypted value, a ciphertext, or a user or organisation
// identifier; only counts.
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const raw = process.env.MFA_ENCRYPTION_KEY ?? "";
const key = Buffer.from(raw, "base64");
if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) {
  console.error("MFA_ENCRYPTION_KEY must be valid base64 for a 32-byte key.");
  process.exit(1);
}

// Subkeys must match lib/instanceConfigSecrets.ts, lib/orgSecrets.ts,
// lib/payments/secrets.ts and lib/checkInStation.ts; lib/mfa.ts uses the raw key.
const subkey = (info) => Buffer.from(crypto.hkdfSync("sha256", key, Buffer.alloc(0), info, 32));
const instanceKey = subkey("yuyu-instance-service-settings-v1");
const organisationKey = subkey("spaceworks-events-organisation-integration-secrets-v1");
const paymentKey = subkey("spaceworks-events-organisation-payment-secrets-v1");
const stationPinKey = subkey("swe-check-in-station-pin-v2");

/** `aad` is the organisation and slot the value is bound to, when it has one. */
function decrypts(value, aesKey, { aad, versions = ["v1"] } = {}) {
  try {
    const [version, iv, tag, encrypted] = value.split(".");
    if (!versions.includes(version) || !iv || !tag || !encrypted) return false;
    const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, Buffer.from(iv, "base64url"));
    if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]);
    return true;
  } catch {
    return false;
  }
}

const prisma = new PrismaClient();
const failures = [];
const counts = [];

/** Rows of a query, or none when the database predates that table. */
async function rows(query) {
  try {
    return await query;
  } catch {
    return [];
  }
}

/** Count the `values` that `readable` can't decrypt, and record them under `label`. */
function check(label, values, readable) {
  const unreadable = values.filter((row) => !readable(row)).length;
  if (unreadable > 0) failures.push(`${unreadable} of ${values.length} ${label}`);
  counts.push(`${values.length} ${label}`);
}

try {
  // SELECT * tolerates a database that has not yet applied newer columns.
  const [settings] = await prisma.$queryRaw`SELECT * FROM "InstanceSetting" WHERE id = 'global'`;
  const fields = { smtpPasswordEncrypted: "SMTP password", googleClientSecretEncrypted: "Google client secret", opsWebhookUrlEncrypted: "Alert webhook URL" };
  let checked = 0;
  for (const [column, label] of Object.entries(fields)) {
    const value = settings?.[column];
    if (typeof value !== "string" || !value) continue;
    checked += 1;
    if (!decrypts(value, instanceKey)) failures.push(`${label} (Super admin -> Settings)`);
  }
  counts.push(`${checked} instance setting(s)`);

  const seeds = await prisma.$queryRaw`SELECT "mfaSecretEncrypted" AS value FROM "User" WHERE "mfaSecretEncrypted" IS NOT NULL`;
  check("authenticator seed(s)", seeds, (row) => decrypts(row.value, key));

  const mail = await rows(prisma.$queryRaw`SELECT "organisationId", "smtpPasswordEncrypted" AS value FROM "OrganisationEmailSettings" WHERE "smtpPasswordEncrypted" IS NOT NULL`);
  check("organisation mail server password(s)", mail, (row) => decrypts(row.value, organisationKey, { aad: `${row.organisationId}\u0000OrganisationEmailSettings.smtpPasswordEncrypted` }));

  const chat = await rows(prisma.$queryRaw`SELECT id, "organisationId", "secretEncrypted" AS value FROM "ChatChannel"`);
  check("chat channel credential(s)", chat, (row) => decrypts(row.value, organisationKey, { aad: `${row.organisationId}\u0000ChatChannel.${row.id}` }));

  const payments = await rows(prisma.$queryRaw`SELECT * FROM "OrganisationPaymentSettings"`);
  const paymentFields = ["razorpayKeySecretEncrypted", "razorpayWebhookSecretEncrypted", "stripeSecretKeyEncrypted", "stripeWebhookSecretEncrypted"];
  check("payment key(s)", payments.flatMap((row) => paymentFields
    .filter((field) => typeof row[field] === "string" && row[field])
    .map((field) => ({ value: row[field], aad: `${row.organisationId}\u0000${field}` }))), (secret) => decrypts(secret.value, paymentKey, { aad: secret.aad }));

  // Station PINs: v2 under the subkey, or older v1 under the raw key.
  const pins = await rows(prisma.$queryRaw`SELECT "checkInStationPinEncrypted" AS value FROM "Event" WHERE "checkInStationPinEncrypted" IS NOT NULL`);
  check("check-in station PIN(s)", pins, (row) => decrypts(row.value, stationPinKey, { versions: ["v2"] }) || decrypts(row.value, key));

  if (failures.length > 0) {
    console.error(
      `MFA_ENCRYPTION_KEY cannot decrypt: ${failures.join("; ")}. ` +
        "Use the key that encrypted this data on every replica and job. If that key is lost, re-enter the affected " +
        "settings (Super admin -> Settings, and each organisation's email, chat and payment settings), set new " +
        `station PINs, and have affected users re-enrol MFA. Checked: ${counts.join(", ")}.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`Stored secrets decrypt with this MFA_ENCRYPTION_KEY (${counts.join(", ")}).`);
  }
} finally {
  await prisma.$disconnect();
}
