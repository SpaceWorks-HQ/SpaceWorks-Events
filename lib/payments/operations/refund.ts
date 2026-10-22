import "server-only";

import { OrderStatus, PaymentRefundStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { notifyChat } from "@/lib/chat/notify";
import { enqueueOrderEmail, enqueuePaymentEmail } from "../email";
import { formatMoney } from "../money";
import { asRefundPolicy, policyRefundMinor } from "../refundPolicy";
import { createPendingRefund, submitPendingRefund } from "../refunds";
import { seatTargetOf } from "../targets";
import { COLLECTED, COMMITTED_REFUND, lockOrder, PaymentOperationError, ZERO } from "./shared";
import { fillFromWaitlist } from "./waitlist";

/** What is still refundable on each collected payment of an order. */
function refundable(payments: Array<{ id: string; amountMinor: bigint; refunds: Array<{ amountMinor: bigint; status: PaymentRefundStatus; }>; }>) {
  return payments.map((payment) => ({
    id: payment.id,
    remaining: payment.amountMinor - payment.refunds.filter((refund) => COMMITTED_REFUND.includes(refund.status)).reduce((sum, refund) => sum + refund.amountMinor, ZERO),
  }));
}

/**
 * Refund an order, in full or in part, optionally cancelling its tickets
 * (which frees the seats for the waitlist). Online refunds are recorded
 * under the lock and sent to the provider after commit; money returned by
 * hand for an offline payment is recorded as already settled.
 */
export async function refundOrder(params: {
  orderId: string;
  organisationId: string;
  actorUserId: string | null;
  /** Null refunds everything still refundable. */
  amountMinor: bigint | null;
  reason: string;
  cancelTickets: boolean;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const outcome = await prisma.$transaction(async (tx) => {
    await lockOrder(tx, params.orderId);
    const order = await tx.order.findFirst({
      where: { id: params.orderId, organisationId: params.organisationId },
      select: {
        id: true, status: true, buyerEmail: true, currency: true,
        rsvps: { select: { id: true, checkedInAt: true, eventId: true, eventInstanceId: true } },
        payments: { where: { status: { in: COLLECTED } }, orderBy: { paidAt: "asc" }, select: { id: true, status: true, amountMinor: true } },
      },
    });
    if (!order || order.status !== OrderStatus.CONFIRMED) throw new PaymentOperationError("Only confirmed orders can be refunded or cancelled.");
    for (const payment of order.payments) await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`;
    const refunds = await tx.paymentRefund.findMany({ where: { paymentId: { in: order.payments.map((payment) => payment.id) } }, select: { paymentId: true, amountMinor: true, status: true } });
    const balances = refundable(order.payments.map((payment) => ({ ...payment, refunds: refunds.filter((refund) => refund.paymentId === payment.id) })));
    const available = balances.reduce((sum, balance) => sum + balance.remaining, ZERO);
    const wanted = params.amountMinor ?? available;
    if (wanted < ZERO || wanted > available) throw new PaymentOperationError(`You can refund up to ${formatMoney(available, order.currency)} on this order.`);
    if (wanted === ZERO && !params.cancelTickets) throw new PaymentOperationError("Enter an amount to refund.");
    if (params.cancelTickets && order.rsvps.some((rsvp) => rsvp.checkedInAt)) throw new PaymentOperationError("Someone on this order has checked in, so its tickets can't be cancelled.");

    const onlineRefundIds: string[] = [];
    let left = wanted;
    let refundedPaymentId: string | null = null;
    for (const balance of balances) {
      if (left === ZERO) break;
      const amount = balance.remaining < left ? balance.remaining : left;
      if (amount === ZERO) continue;
      left -= amount;
      refundedPaymentId ??= balance.id;
      const payment = order.payments.find((candidate) => candidate.id === balance.id)!;
      // Paid in person (even on an order that started online): returned in person, and recorded.
      if (payment.status === PaymentStatus.PAID_OFFLINE) {
        await tx.paymentRefund.create({ data: { paymentId: payment.id, amountMinor: amount, offline: true, status: PaymentRefundStatus.SUCCEEDED, settledAt: now, reason: params.reason.slice(0, 500), createdByUserId: params.actorUserId } });
      } else {
        onlineRefundIds.push((await createPendingRefund(tx, { paymentId: payment.id, amountMinor: amount, reason: params.reason, createdByUserId: params.actorUserId })).id);
      }
    }
    if (params.cancelTickets) {
      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELLED } });
      // A reservation to be paid at the desk is no longer owed.
      await tx.payment.updateMany({ where: { orderId: order.id, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.CANCELED } });
      // The order, its lines, payments and refunds keep the record.
      await tx.rSVP.deleteMany({ where: { orderId: order.id } });
    }
    if (refundedPaymentId) await enqueuePaymentEmail(tx, { to: order.buyerEmail, paymentId: refundedPaymentId, notice: "refunded" });
    // Complimentary, unpaid or nothing left to refund: still tell the buyer.
    else if (params.cancelTickets) await enqueueOrderEmail(tx, { to: order.buyerEmail, orderId: order.id, notice: "cancelled" });
    if (wanted > ZERO || params.cancelTickets) {
      await notifyChat(tx, params.organisationId, "refund", `${wanted > ZERO ? `Refund of ${formatMoney(wanted, order.currency)}` : "Tickets cancelled"} for ${order.buyerEmail}${params.cancelTickets ? ", tickets cancelled" : ""}. Reason: ${params.reason.slice(0, 200)}`);
    }
    await recordAuditEvent({
      action: params.cancelTickets ? "ORDER_CANCELLED" : "PAYMENT_REFUNDED",
      actorUserId: params.actorUserId, organisationId: params.organisationId, targetType: "Order", targetId: order.id,
      metadata: { amountMinor: wanted.toString(), cancelled: params.cancelTickets }, client: tx,
    });
    const freed = params.cancelTickets ? [...new Map(order.rsvps.flatMap((rsvp) => { const target = seatTargetOf(rsvp); return target ? [[JSON.stringify(target), target] as const] : []; })).values()] : [];
    return { onlineRefundIds, freed, refundedMinor: wanted };
  });
  for (const refundId of outcome.onlineRefundIds) await submitPendingRefund(refundId).catch(() => undefined);
  for (const target of outcome.freed) await fillFromWaitlist(target, now);
  return { refundedMinor: outcome.refundedMinor };
}

/** The buyer's view of cancelling: allowed, and what comes back. */
export async function buyerCancellation(orderId: string, now = new Date()) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true, refundPolicy: true, event: { select: { startDateTime: true } },
      rsvps: { select: { checkedInAt: true, eventInstance: { select: { startDateTime: true } } } },
      payments: { where: { status: { in: COLLECTED } }, select: { id: true, amountMinor: true, refunds: { select: { amountMinor: true, status: true } } } },
    },
  });
  if (!order) return null;
  // A series order (a date, or a pass) starts at its first date.
  const firstDate = order.rsvps.map((rsvp) => rsvp.eventInstance?.startDateTime).filter((date): date is Date => Boolean(date)).sort((a, b) => a.getTime() - b.getTime())[0];
  const start = order.event?.startDateTime ?? firstDate;
  if (order.status !== OrderStatus.CONFIRMED || !start || order.rsvps.some((rsvp) => rsvp.checkedInAt)) return null;
  const available = refundable(order.payments).reduce((sum, balance) => sum + balance.remaining, ZERO);
  // Complimentary or free orders can always be given up.
  if (order.payments.length === 0) return { refundMinor: ZERO };
  const refundMinor = policyRefundMinor(asRefundPolicy(order.refundPolicy), available, start, now);
  return refundMinor == null ? null : { refundMinor };
}

/** The buyer cancels their whole order within its refund policy. */
export async function cancelOrderAsBuyer(params: { orderId: string; now?: Date; }) {
  const now = params.now ?? new Date();
  const order = await prisma.order.findUnique({ where: { id: params.orderId }, select: { organisationId: true, buyerUserId: true } });
  const terms = await buyerCancellation(params.orderId, now);
  if (!order || !terms) throw new PaymentOperationError("This order can't be cancelled online. Contact the organiser.");
  return refundOrder({
    orderId: params.orderId, organisationId: order.organisationId, actorUserId: order.buyerUserId,
    amountMinor: terms.refundMinor, reason: "Cancelled by the buyer under the refund policy", cancelTickets: true, now,
  });
}
