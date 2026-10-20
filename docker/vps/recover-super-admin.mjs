// Operator recovery for a locked-out super admin (lost authenticator or
// password), run as root on the server through the ops role:
//   node docker/vps/recover-super-admin.mjs [email]
// It removes the account's authenticator and recovery codes, signs out every
// session, and prints a one-hour password-reset link for the operator to open.
// The email defaults to SUPER_ADMIN_EMAIL. The link is printed only here.
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const email = (process.argv[2] || process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
  console.error("Usage: recover-super-admin.mjs [email]; SUPER_ADMIN_EMAIL is not set to an email address.");
  process.exit(1);
}
const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "");
const prisma = new PrismaClient();
try {
  const token = randomBytes(32).toString("hex");
  const user = await prisma.$transaction(async (tx) => {
    const found = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (!found) return null;
    await tx.user.update({
      where: { id: found.id },
      data: { mfaSecretEncrypted: null, mfaEnabledAt: null, recoveryCodeHashes: [], sessionVersion: { increment: 1 } },
    });
    await tx.session.deleteMany({ where: { userId: found.id } });
    // The same one-time, hashed token the reset-password page accepts.
    await tx.verificationToken.deleteMany({ where: { identifier: `reset:${email}` } });
    await tx.verificationToken.create({
      data: { identifier: `reset:${email}`, token: createHash("sha256").update(token).digest("hex"), expires: new Date(Date.now() + 60 * 60 * 1000) },
    });
    await tx.auditEvent.create({ data: { action: "OPERATOR_ACCOUNT_RECOVERY", targetType: "User", targetId: found.id, metadata: { mfaReset: true, sessionsRevoked: true } } });
    return found;
  });
  if (!user) {
    console.error(`No account uses ${email}. Sign up with it at ${baseUrl}/login; it becomes the super admin when it matches SUPER_ADMIN_EMAIL.`);
    process.exitCode = 1;
  } else {
    console.log(`Authenticator and recovery codes removed, and every session signed out, for ${email}.`);
    console.log("Open this link within an hour to set a new password, then sign in and set up an authenticator again:");
    console.log(`${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`);
  }
} finally {
  await prisma.$disconnect();
}
