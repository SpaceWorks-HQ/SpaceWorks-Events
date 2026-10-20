import "server-only";

import { CheckoutAttemptStatus, OrderStatus, PaymentRefundStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { enqueuePaymentEmail } from "./email";
import type { OnlineProvider } from "./http";
import { submitPendingRefund } from "./refunds";
import { settlePaidNotification } from "./settlement";
import { loadPaymentAccount } from "./settings";

const BATCH = 25;
/** Refunds still pending at the provider are re-checked this long after submission. */
const REFUND_RETRY_AFTER_MS = 2 * 60_000;
/** A page creation that never finished (a crash mid-request) is abandoned after this. */
const STALLED_ATTEMPT_MS = 5 * 60_000;

/**
 * Release one order whose hold has ended. Every open provider page is
 * cancelled first; the seats are released only once all are closed, so they
 * are never resold while a page can still take money. If the buyer paid
 * first, the order is settled instead (and refunded if the seats are gone).
 */
async function releaseOrder(orderId: string, now: Date): Promise<"expired" | "settled" | "skipped"> {
  const attempts = await prisma.paymentCheckoutAttempt.findMany({
    where: { status: CheckoutAttemptStatus.OPEN, payment: { orderId } },
    select: { id: true, provider: true, externalId: true, createdAt: true, payment: { select: { organisationId: true } } },
  });
  for (const attempt of attempts) {
    if (!attempt.externalId) {
      // The provider may still have created it; its webhook would carry our attempt id.
      if (attempt.createdAt.getTime() > now.getTime() - STALLED_ATTEMPT_MS) return "skipped";
      continue;
    }
    const provider = attempt.provider as OnlineProvider;
    const account = await loadPaymentAccount(attempt.payment.organisationId, provider);
    // Without keys the page can't be cancelled; a later payment still arrives by
    // webhook and is refunded if the seats are gone.
    if (!account) continue;
    let state;
    try {
      state = await account.gateway.cancelCheckout(attempt.externalId);
    } catch {
      return "skipped"; // Outcome unknown: keep the seats held and retry next tick.
    }
    if (state.state === "open") return "skipped";
    if (state.state === "paid") {
      const paid = state;
      const result = await prisma.$transaction((tx) => settlePaidNotification(tx, { organisationId: attempt.payment.organisationId, provider }, {
        checkoutId: attempt.externalId, reference: attempt.id, paymentId: paid.paymentId, amountMinor: paid.amountMinor, currency: paid.currency,
      }, now));
      for (const refundId of result.refundIds) await submitPendingRefund(refundId).catch(() => undefined);
      return "settled";
    }
  }

  return prisma.$transaction(async (tx) => {
    const row = await tx.order.findUnique({ where: { id: orderId }, select: { eventId: true } });
    if (row?.eventId) await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${row.eventId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, organisationId: true, status: true, holdExpiresAt: true, buyerEmail: true, payments: { where: { status: PaymentStatus.PENDING }, select: { id: true } } },
    });
    // Extended or settled meanwhile.
    if (order?.status !== OrderStatus.PENDING || (order.holdExpiresAt && order.holdExpiresAt > now)) return "skipped" as const;
    await tx.paymentCheckoutAttempt.updateMany({ where: { status: CheckoutAttemptStatus.OPEN, payment: { orderId } }, data: { status: CheckoutAttemptStatus.EXPIRED } });
    await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.EXPIRED, holdExpiresAt: null, holdCapAt: null } });
    // The registrations stay as ended holds (no longer counted toward
    // capacity); ordering again replaces them.
    for (const payment of order.payments) {
      await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.EXPIRED } });
      await enqueuePaymentEmail(tx, { to: order.buyerEmail, paymentId: payment.id, notice: "expired" });
    }
    await recordAuditEvent({ action: "ORDER_HOLD_EXPIRED", organisationId: order.organisationId, targetType: "Order", targetId: orderId, client: tx });
    return "expired" as const;
  });
}

/**
 * One pass of payment housekeeping, run by the one-minute outbox scheduler:
 * release ended holds, and submit or re-check refunds left pending.
 */
export async function runPaymentMaintenance(now = new Date()) {
  let expired = 0;
  let settled = 0;
  const stale = await prisma.order.findMany({
    where: { status: OrderStatus.PENDING, holdExpiresAt: { lte: now } },
    select: { id: true },
    orderBy: { holdExpiresAt: "asc" },
    take: BATCH,
  });
  for (const { id } of stale) {
    const result = await releaseOrder(id, now).catch(() => "skipped" as const);
    if (result === "expired") expired += 1;
    if (result === "settled") settled += 1;
  }
  const refunds = await prisma.paymentRefund.findMany({
    where: {
      status: PaymentRefundStatus.PENDING,
      offline: false,
      externalRefundId: null,
      OR: [{ submittedAt: null }, { submittedAt: { lt: new Date(now.getTime() - REFUND_RETRY_AFTER_MS) } }],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });
  let refundsSubmitted = 0;
  for (const { id } of refunds) {
    if ((await submitPendingRefund(id).catch(() => "skipped" as const)) === "submitted") refundsSubmitted += 1;
  }
  return { expired, settled, refundsSubmitted };
}
