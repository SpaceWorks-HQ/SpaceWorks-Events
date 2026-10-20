import "server-only";

import { PaymentRefundStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { PaymentsUnavailable, type OnlineProvider } from "./http";
import type { RefundNotification } from "./providers/types";
import { loadPaymentAccount } from "./settings";

/** A refund claimed this recently is assumed to be in flight on another worker. */
const SUBMISSION_LEASE_MS = 2 * 60_000;

/**
 * Step 1 of a refund, inside the caller's transaction (which holds the
 * payment row lock): record a PENDING row. The database trigger refuses it if
 * pending plus succeeded refunds would exceed the payment. The provider is
 * called afterwards, outside any lock, by submitPendingRefund.
 */
export async function createPendingRefund(tx: Prisma.TransactionClient, params: {
  paymentId: string;
  amountMinor: bigint;
  reason: string;
  automatic?: boolean;
  createdByUserId?: string | null;
}) {
  return tx.paymentRefund.create({
    data: {
      paymentId: params.paymentId,
      amountMinor: params.amountMinor,
      reason: params.reason.slice(0, 500),
      automatic: params.automatic ?? false,
      createdByUserId: params.createdByUserId ?? null,
    },
    select: { id: true },
  });
}

/**
 * Steps 2 and 3: ask the provider, then settle the row from its answer.
 * Safe to call repeatedly (the outbox tick retries anything left pending): a
 * lease stops two workers submitting at once, and a refund that was already
 * submitted is first looked up by our id so money is never returned twice.
 */
export async function submitPendingRefund(refundId: string): Promise<"submitted" | "skipped" | "failed"> {
  const now = new Date();
  const refund = await prisma.paymentRefund.findUnique({
    where: { id: refundId },
    select: {
      id: true, amountMinor: true, status: true, offline: true, externalRefundId: true, submittedAt: true,
      payment: { select: { id: true, organisationId: true, provider: true, currency: true, externalPaymentId: true } },
    },
  });
  if (!refund || refund.status !== PaymentRefundStatus.PENDING || refund.offline || refund.externalRefundId) return "skipped";
  if (refund.submittedAt && refund.submittedAt.getTime() > now.getTime() - SUBMISSION_LEASE_MS) return "skipped";
  // Optimistic claim on the previous submission time: only one worker wins.
  const claimed = await prisma.paymentRefund.updateMany({
    where: { id: refund.id, status: PaymentRefundStatus.PENDING, externalRefundId: null, submittedAt: refund.submittedAt },
    data: { submittedAt: now },
  });
  if (claimed.count !== 1) return "skipped";
  const isRetry = refund.submittedAt !== null;
  const { payment } = refund;
  if (payment.provider === "OFFLINE" || !payment.externalPaymentId) return "skipped";
  const account = await loadPaymentAccount(payment.organisationId, payment.provider as OnlineProvider);
  if (!account) return "skipped";

  let result: Awaited<ReturnType<typeof account.gateway.createRefund>> | null = null;
  try {
    // An earlier attempt may have reached the provider before failing here.
    if (isRetry) result = await account.gateway.findRefund(payment.externalPaymentId, refund.id);
    result ??= await account.gateway.createRefund({
      paymentId: payment.externalPaymentId,
      amountMinor: refund.amountMinor,
      currency: payment.currency,
      reference: refund.id,
      idempotencyKey: `refund:${refund.id}`,
    });
  } catch (error) {
    // A definite refusal (for example the balance is too low) fails the row;
    // anything else stays pending and is retried on the next tick.
    if (error instanceof PaymentsUnavailable && error.status && error.status >= 400 && error.status < 500 && error.status !== 409 && error.status !== 429) {
      await prisma.paymentRefund.updateMany({ where: { id: refund.id, status: PaymentRefundStatus.PENDING }, data: { status: PaymentRefundStatus.FAILED, settledAt: new Date() } });
      await recordAuditEvent({ action: "PAYMENT_REFUND_FAILED", organisationId: payment.organisationId, targetType: "PaymentRefund", targetId: refund.id });
      return "failed";
    }
    return "skipped";
  }
  await prisma.paymentRefund.updateMany({
    where: { id: refund.id, status: PaymentRefundStatus.PENDING },
    data: {
      externalRefundId: result.refundId,
      status: result.state,
      settledAt: result.state === "PENDING" ? null : new Date(),
    },
  });
  if (result.state === "FAILED") {
    await recordAuditEvent({ action: "PAYMENT_REFUND_FAILED", organisationId: payment.organisationId, targetType: "PaymentRefund", targetId: refund.id });
    return "failed";
  }
  return "submitted";
}

/**
 * Applies a verified refund webhook. Only refunds this organisation created
 * are matched: by the provider's refund id, or by our id echoed in its
 * metadata, always within the organisation and provider.
 */
export async function applyRefundNotification(tx: Prisma.TransactionClient, context: { organisationId: string; provider: OnlineProvider; }, notification: RefundNotification) {
  const refund = await tx.paymentRefund.findFirst({
    where: {
      payment: { organisationId: context.organisationId, provider: context.provider },
      OR: [{ externalRefundId: notification.refundId }, ...(notification.reference ? [{ id: notification.reference }] : [])],
    },
    select: { id: true, paymentId: true, status: true, externalRefundId: true, payment: { select: { externalPaymentId: true } } },
  });
  if (!refund) return;
  if (notification.paymentId && refund.payment.externalPaymentId && notification.paymentId !== refund.payment.externalPaymentId) return;
  if (refund.externalRefundId && refund.externalRefundId !== notification.refundId) return;
  await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${refund.paymentId} FOR UPDATE`;
  if (refund.status !== PaymentRefundStatus.PENDING) return;
  await tx.paymentRefund.updateMany({
    where: { id: refund.id, status: PaymentRefundStatus.PENDING },
    data: {
      externalRefundId: notification.refundId,
      status: notification.state,
      settledAt: notification.state === "PENDING" ? null : new Date(),
    },
  });
  if (notification.state === "FAILED") {
    await recordAuditEvent({ action: "PAYMENT_REFUND_FAILED", organisationId: context.organisationId, targetType: "PaymentRefund", targetId: refund.id, client: tx });
  }
}
