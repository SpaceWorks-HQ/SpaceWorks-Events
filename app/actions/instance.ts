"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { OutboxStatus } from "@prisma/client";
import { requireSuperAdminMfa } from "@/lib/permissions";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { prisma } from "@/lib/db";
import { deliverOutboxBatch, enqueueOperatorNotice } from "@/lib/outbox";
import { recordAuditEvent } from "@/lib/audit";
import type { ActionResult } from "./org";
import { trackedRevalidation } from "@/lib/frontend/revalidation";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const RATE_LIMITED = "Too many requests. Try again shortly.";
/** Messages one manual "deliver" click processes; the scheduler keeps draining the rest. */
const MANUAL_DELIVERY_BATCH = 50;

/**
 * Every maintenance control on the operations page shares these steps: fresh
 * super-admin MFA (redirects to the step-up page when stale, outside the
 * try so the redirect is not swallowed), a per-admin rate limit, the mutation
 * with its audit event, and a refresh of the super-admin pages that show the
 * changed counts. Database or audit failures become a UI-safe error instead of
 * an unhandled exception in the client transition.
 */
async function runMaintenance<T>(failure: string, operation: (actorUserId: string) => Promise<T>): Promise<ActionResult<T>> {
  const session = await requireSuperAdminMfa();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: RATE_LIMITED };
  let data: T;
  try {
    data = await operation(session.user.id);
  } catch {
    return { ok: false, error: failure };
  }
  revalidatePath("/super-admin", "layout");
  return { ok: true, data };
}

export async function deliverInstanceOutbox(): Promise<ActionResult<{ sent: number; failed: number }>> {
  return runMaintenance("Could not process the email queue. Check the database connection and try again.", async (actorUserId) => {
    const result = await deliverOutboxBatch(MANUAL_DELIVERY_BATCH);
    await recordAuditEvent({
      action: "INSTANCE_OUTBOX_DELIVERED",
      actorUserId,
      metadata: { sent: result.sent, failed: result.failed },
    });
    return result;
  });
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
  return runMaintenance("Could not purge expired tokens. Try again.", async (actorUserId) => {
    const result = await prisma.verificationToken.deleteMany({ where: { expires: { lt: new Date() } } });
    await recordAuditEvent({
      action: "EXPIRED_VERIFICATION_TOKENS_PURGED",
      actorUserId,
      metadata: { deleted: result.count },
    });
    return { deleted: result.count };
  });
}

/**
 * Requeue permanently failed messages for immediate delivery. `availableAt` is
 * a JS Date, which Prisma stores as UTC like every other outbox timestamp, so
 * the rows are due on the next batch whatever the database TimeZone is.
 * `attempts` is reset so a requeued message gets the normal retry schedule
 * instead of failing terminally again on its first transient error.
 */
const RETRY_FAILED_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export async function retryFailedOutboxMessages(): Promise<ActionResult<{ retried: number }>> {
  return runMaintenance("Could not requeue failed email. Try again.", async (actorUserId) => {
    // Older failures (e.g. broadcasts from before an outage) would arrive days
    // late; they are left for retention cleanup instead of being resent.
    const result = await prisma.outboxMessage.updateMany({
      where: { status: OutboxStatus.FAILED, createdAt: { gte: new Date(Date.now() - RETRY_FAILED_MAX_AGE_MS) } },
      data: { status: OutboxStatus.PENDING, availableAt: new Date(), attempts: 0, lockedAt: null, lastError: null },
    });
    await recordAuditEvent({
      action: "FAILED_OUTBOX_MESSAGES_REQUEUED",
      actorUserId,
      metadata: { retried: result.count },
    });
    return { retried: result.count };
  });
}

/** Records that an operator completed a restore drill; it does not touch provider backups. */
export async function recordBackupRestoreVerification(): Promise<ActionResult> {
  const result = await runMaintenance("Could not record the restore drill. Try again.", async (actorUserId) => {
    await recordAuditEvent({
      action: "BACKUP_RESTORE_VERIFIED",
      actorUserId,
      metadata: { recordedAt: new Date().toISOString() },
    });
  });
  return result.ok ? { ok: true } : result;
}
