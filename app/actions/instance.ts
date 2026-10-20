"use server";

import { OutboxStatus } from "@prisma/client";
import { requireSuperAdminMfa } from "@/lib/permissions";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { prisma } from "@/lib/db";
import { deliverOutboxBatch, enqueueOperatorNotice } from "@/lib/outbox";
import { recordAuditEvent } from "@/lib/audit";
import type { ActionResult } from "./org";

export async function deliverInstanceOutbox(): Promise<ActionResult<{ sent: number; failed: number }>> {
  const session = await requireSuperAdminMfa();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const result = await deliverOutboxBatch(50);
  await recordAuditEvent({
    action: "INSTANCE_OUTBOX_DELIVERED",
    actorUserId: session.user.id,
    metadata: { sent: result.sent, failed: result.failed },
  });
  return { ok: true, data: result };
}

/** Sends a test message to the signed-in super admin through the outbox, with the email settings in effect. */
export async function sendInstanceTestEmail(): Promise<ActionResult<{ to: string; sent: number; failed: number }>> {
  const session = await requireSuperAdminMfa();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  await enqueueOperatorNotice(prisma, {
    to: session.user.email,
    subject: "Space Works Events test email",
    lines: ["This test was sent from Super admin → Operations.", "If you can read it, outgoing email works."],
  });
  const result = await deliverOutboxBatch(20);
  await recordAuditEvent({ action: "INSTANCE_TEST_EMAIL_SENT", actorUserId: session.user.id });
  return { ok: true, data: { to: session.user.email, ...result } };
}

export async function purgeExpiredVerificationTokens(): Promise<ActionResult<{ deleted: number }>> {
  const session = await requireSuperAdminMfa();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const result = await prisma.verificationToken.deleteMany({ where: { expires: { lt: new Date() } } });
  await recordAuditEvent({
    action: "EXPIRED_VERIFICATION_TOKENS_PURGED",
    actorUserId: session.user.id,
    metadata: { deleted: result.count },
  });
  return { ok: true, data: { deleted: result.count } };
}

export async function retryFailedOutboxMessages(): Promise<ActionResult<{ retried: number }>> {
  const session = await requireSuperAdminMfa();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const result = await prisma.outboxMessage.updateMany({
    where: { status: OutboxStatus.FAILED },
    data: { status: OutboxStatus.PENDING, availableAt: new Date(), lockedAt: null, lastError: null },
  });
  await recordAuditEvent({
    action: "FAILED_OUTBOX_MESSAGES_REQUEUED",
    actorUserId: session.user.id,
    metadata: { retried: result.count },
  });
  return { ok: true, data: { retried: result.count } };
}

export async function recordBackupRestoreVerification(): Promise<ActionResult> {
  const session = await requireSuperAdminMfa();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  await recordAuditEvent({
    action: "BACKUP_RESTORE_VERIFIED",
    actorUserId: session.user.id,
    metadata: { recordedAt: new Date().toISOString() },
  });
  return { ok: true };
}
