// Confirms that MFA_ENCRYPTION_KEY in this environment can decrypt the secrets
// already stored in the database: the Super admin -> Settings SMTP password,
// Google client secret, and alert webhook URL, plus enrolled TOTP seeds.
//
// Run it with exactly the environment the application receives (for example
// `node --env-file=/secure/path/swevents.env scripts/check-instance-secrets.mjs`,
// or inside the migrator image/job). A failure means the key differs from the
// one that encrypted the data (rotated, or not identical on every replica/job).
// The application keeps running in that state, but email delivery, Google
// sign-in, alerts, and MFA step-up fail at use time.
//
// It never prints a decrypted value, a ciphertext, or a user identifier.
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const raw = process.env.MFA_ENCRYPTION_KEY ?? "";
const key = Buffer.from(raw, "base64");
if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) {
  console.error("MFA_ENCRYPTION_KEY must be valid base64 for a 32-byte key.");
  process.exit(1);
}

// Must match lib/instanceConfigSecrets.ts (domain-separated subkey) and lib/mfa.ts (raw key).
const instanceKey = Buffer.from(crypto.hkdfSync("sha256", key, Buffer.alloc(0), "yuyu-instance-service-settings-v1", 32));

function decrypts(value, aesKey) {
  try {
    const [version, iv, tag, encrypted] = value.split(".");
    if (version !== "v1" || !iv || !tag || !encrypted) return false;
    const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]);
    return true;
  } catch {
    return false;
  }
}

const prisma = new PrismaClient();
const failures = [];

try {
  // SELECT * tolerates a database that has not yet applied newer columns.
  const [settings] = await prisma.$queryRaw`SELECT * FROM "InstanceSetting" WHERE id = 'global'`;
  const fields = {
    smtpPasswordEncrypted: "SMTP password",
    googleClientSecretEncrypted: "Google client secret",
    opsWebhookUrlEncrypted: "Alert webhook URL",
  };
  let checked = 0;
  for (const [column, label] of Object.entries(fields)) {
    const value = settings?.[column];
    if (typeof value !== "string" || !value) continue;
    checked += 1;
    if (!decrypts(value, instanceKey)) failures.push(`${label} (Super admin -> Settings)`);
  }

  const seeds = await prisma.$queryRaw`SELECT "mfaSecretEncrypted" AS value FROM "User" WHERE "mfaSecretEncrypted" IS NOT NULL`;
  const unreadableSeeds = seeds.filter((row) => !decrypts(row.value, key)).length;
  if (unreadableSeeds > 0) failures.push(`${unreadableSeeds} of ${seeds.length} enrolled authenticator seed(s)`);

  if (failures.length > 0) {
    console.error(
      `MFA_ENCRYPTION_KEY cannot decrypt: ${failures.join("; ")}. ` +
        "Use the key that encrypted this data on every replica and job. If that key is lost, re-enter the affected " +
        "settings in Super admin -> Settings and have affected users re-enrol MFA.",
    );
    process.exitCode = 1;
  } else {
    console.log(`Stored secrets decrypt with this MFA_ENCRYPTION_KEY (${checked} instance setting(s), ${seeds.length} MFA seed(s)).`);
  }
} finally {
  await prisma.$disconnect();
}
