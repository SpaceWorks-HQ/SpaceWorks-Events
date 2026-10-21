import "server-only";

import { CheckoutAttemptStatus, EventPrivacyType, OfflinePaymentMethod, OrderStatus, PaymentRefundStatus, PaymentStatus, RsvpStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isPaidEventsEnabled } from "@/lib/instanceSettings";
import { enqueueRsvpConfirmation, enqueueRsvpStatusNotification } from "@/lib/outbox";
import { closeOpenAttempts } from "./checkout";
import { enqueueOrderEmail, enqueuePaymentEmail } from "./email";
import { HOLD_EXTENSION_CAP_MS, isActiveHold, PAYMENT_LINK_HOLD_MS } from "./holds";
import { formatMoney, providerMinimumMinor } from "./money";
import { effectiveOfflineRecord } from "./offlineRecord";
import { asRefundPolicy, policyRefundMinor } from "./refundPolicy";
import { createPendingRefund, submitPendingRefund } from "./refunds";
import { loadPaymentAccount } from "./settings";
import { hasFreeSeats, lockOrderTargets, lockSeriesDates, ORDER_SUBJECT_SELECT, orderSubject, seatTargetOf, type SeatTarget } from "./targets";

/** An organiser operation was refused; the message is safe to show. */
export class PaymentOperationError extends Error {}

const ZERO = BigInt(0);
const COLLECTED: PaymentStatus[] = [PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_OFFLINE];
const COMMITTED_REFUND: PaymentRefundStatus[] = [PaymentRefundStatus.PENDING, PaymentRefundStatus.SUCCEEDED];

/** Lock order everywhere: the event row (or the series, then its dates), then the order. */
async function lockOrder(tx: Prisma.TransactionClient, orderId: string) {
  const row = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, eventId: true, eventSeriesId: true } });
  if (row) await lockOrderTargets(tx, row);
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
}

const subjectTitle = (order: Parameters<typeof orderSubject>[0]) => orderSubject(order)?.title ?? "your event";

async function onlineAccount(organisationId: string) {
  if (!(await isPaidEventsEnabled())) throw new PaymentOperationError("Paid events are turned off for this installation.");
  const account = await loadPaymentAccount(organisationId);
  if (!account) throw new PaymentOperationError("Connect a payment account in the organisation's payment settings first.");
  return account;
}

function attendeeEmail(rsvp: { guestEmail: string | null; user: { email: string | null; } | null; }) {
  return rsvp.user?.email?.trim() || rsvp.guestEmail;
}

/**
 * Offer a paid request (approved, or reached on the waitlist) its seats: the
 * order holds them for a day with one pending payment and the buyer is
 * emailed a link. The checkout page opens only when they click Pay.
 */
async function offerInTransaction(tx: Prisma.TransactionClient, params: { orderId: string; organisationId: string; provider: "RAZORPAY" | "STRIPE"; testMode: boolean; actorUserId: string | null; now: Date; }) {
  await lockOrder(tx, params.orderId);
  const order = await tx.order.findFirst({
    where: { id: params.orderId, organisationId: params.organisationId },
    select: { id: true, status: true, totalMinor: true, currency: true, buyerEmail: true, ...ORDER_SUBJECT_SELECT, rsvps: { select: { id: true, orderId: true, eventId: true, eventInstanceId: true, ticketTypeId: true, status: true } } },
  });
  if (!order || order.status !== OrderStatus.REQUESTED || order.rsvps.length === 0) throw new PaymentOperationError("This request was changed by someone else.");
  const subject = orderSubject(order);
  if (!subject || !subject.open(params.now)) throw new PaymentOperationError("This event is no longer open for registration.");
  if (order.totalMinor < providerMinimumMinor(params.provider, order.currency)) throw new PaymentOperationError("This order is below the smallest payment the provider accepts.");
  if (!(await hasFreeSeats(tx, order.rsvps, params.now))) throw new PaymentOperationError("There aren't enough free places for this order yet.");
  const holdExpiresAt = new Date(params.now.getTime() + PAYMENT_LINK_HOLD_MS);
  await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.PENDING, holdExpiresAt, holdCapAt: new Date(holdExpiresAt.getTime() + HOLD_EXTENSION_CAP_MS), testMode: params.testMode } });
  await tx.rSVP.updateMany({ where: { orderId: order.id }, data: { status: RsvpStatus.PENDING_PAYMENT, holdExpiresAt } });
  const payment = await tx.payment.create({
    data: { organisationId: params.organisationId, orderId: order.id, amountMinor: order.totalMinor, currency: order.currency, provider: params.provider, testMode: params.testMode, description: subject.title.slice(0, 300) },
    select: { id: true },
  });
  await enqueuePaymentEmail(tx, { to: order.buyerEmail, paymentId: payment.id, notice: "pending" });
  await recordAuditEvent({ action: "ORDER_OFFERED", actorUserId: params.actorUserId, organisationId: params.organisationId, targetType: "Order", targetId: order.id, client: tx });
}

export async function offerRequestedOrder(params: { orderId: string; organisationId: string; actorUserId: string | null; now?: Date; }) {
  const account = await onlineAccount(params.organisationId);
  await prisma.$transaction((tx) => offerInTransaction(tx, { ...params, provider: account.provider, testMode: account.testMode, now: params.now ?? new Date() }));
}

/** Decline a paid request: nothing was charged; its registrations are rejected. */
export async function declineRequestedOrder(params: { orderId: string; organisationId: string; actorUserId: string; }) {
  await prisma.$transaction(async (tx) => {
    await lockOrder(tx, params.orderId);
    const order = await tx.order.findFirst({
      where: { id: params.orderId, organisationId: params.organisationId },
      select: { id: true, status: true, buyerEmail: true, buyerName: true, ...ORDER_SUBJECT_SELECT },
    });
    if (!order || order.status !== OrderStatus.REQUESTED) throw new PaymentOperationError("This request was changed by someone else.");
    await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELLED } });
    await tx.rSVP.updateMany({ where: { orderId: order.id }, data: { status: RsvpStatus.REJECTED } });
    await enqueueRsvpStatusNotification(tx, { to: order.buyerEmail, eventTitle: subjectTitle(order), approved: false, recipientName: order.buyerName || undefined });
    await recordAuditEvent({ action: "ORDER_DECLINED", actorUserId: params.actorUserId, organisationId: params.organisationId, targetType: "Order", targetId: order.id, client: tx });
  });
}

/**
 * Seats came free: offer them to the head of the waitlist. A free waitlisted
 * registration is confirmed; a paid request is offered a payment link. Only
 * the first in line is tried, so nobody is skipped for a smaller order.
 */
export async function offerNextWaitlisted(target: SeatTarget, now = new Date()): Promise<boolean> {
  let owner: { organisationId: string; privacyType: EventPrivacyType; title: string; seriesId: string | null; } | null = null;
  if ("eventId" in target) {
    const event = await prisma.event.findUnique({ where: { id: target.eventId }, select: { organisationId: true, privacyType: true, title: true } });
    owner = event ? { ...event, seriesId: null } : null;
  } else {
    const date = await prisma.eventInstance.findUnique({ where: { id: target.eventInstanceId }, select: { eventSeriesId: true, series: { select: { organisationId: true, privacyType: true, title: true } } } });
    owner = date ? { ...date.series, seriesId: date.eventSeriesId } : null;
  }
  if (!owner || owner.privacyType === EventPrivacyType.APPROVAL_REQUIRED) return false;
  const { seriesId } = owner;
  const next = await prisma.rSVP.findFirst({
    where: { ...target, status: RsvpStatus.WAITLISTED },
    orderBy: { createdAt: "asc" },
    select: { id: true, orderId: true, eventId: true, eventInstanceId: true, ticketTypeId: true, checkInToken: true, guestEmail: true, user: { select: { email: true } }, order: { select: { status: true, totalMinor: true } } },
  });
  if (!next) return false;
  if (next.order && next.order.totalMinor > ZERO) {
    if (next.order.status !== OrderStatus.REQUESTED) return false;
    return offerRequestedOrder({ orderId: next.orderId!, organisationId: owner.organisationId, actorUserId: null, now }).then(() => true, () => false);
  }
  return prisma.$transaction(async (tx) => {
    if ("eventId" in target) await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${target.eventId} FOR UPDATE`;
    else if (seriesId) await lockSeriesDates(tx, seriesId, [target.eventInstanceId], now);
    if (!(await hasFreeSeats(tx, [next], now))) return false;
    const promoted = await tx.rSVP.updateMany({ where: { id: next.id, status: RsvpStatus.WAITLISTED }, data: { status: RsvpStatus.CONFIRMED } });
    const to = attendeeEmail(next);
    if (promoted.count === 1 && to) await enqueueRsvpStatusNotification(tx, { to, eventTitle: owner.title, approved: true, checkInToken: next.checkInToken });
    return promoted.count === 1;
  });
}

/** Offer every free seat, in waitlist order, until the seats or the waitlist run out. Returns how many were offered. */
export async function fillFromWaitlist(target: SeatTarget, now = new Date(), limit = 100) {
  let offered = 0;
  while (offered < limit && (await offerNextWaitlisted(target, now).catch(() => false))) offered += 1;
  return offered;
}

/**
 * The beat's safety net: free seats on upcoming events and dates go to their
 * waitlists, after a capacity increase, a removed guest, or a promotion that
 * failed after its commit.
 */
export async function fillWaitlists(now = new Date()) {
  const waiting = await prisma.rSVP.groupBy({
    by: ["eventId", "eventInstanceId"],
    where: {
      status: RsvpStatus.WAITLISTED,
      OR: [
        { event: { endDateTime: { gt: now }, privacyType: { not: EventPrivacyType.APPROVAL_REQUIRED } } },
        { eventInstance: { endDateTime: { gt: now }, cancelledAt: null, series: { privacyType: { not: EventPrivacyType.APPROVAL_REQUIRED } } } },
      ],
    },
    orderBy: [{ eventId: "asc" }, { eventInstanceId: "asc" }],
    take: 200,
  });
  let offered = 0;
  for (const row of waiting) {
    const target = seatTargetOf(row);
    if (target) offered += await fillFromWaitlist(target, now);
  }
  return { offered };
}

/**
 * Settle a pending order by hand: money collected in person, or the tickets
 * made complimentary. Open provider pages are cancelled first, so the buyer
 * can't also pay online; if they already had, that payment stands instead.
 */
export async function settleOrderByHand(params: {
  orderId: string;
  organisationId: string;
  actorUserId: string;
  mode: "offline" | "waive";
  method?: OfflinePaymentMethod;
  reference?: string | null;
  now?: Date;
}): Promise<"confirmed" | "already-paid"> {
  const now = params.now ?? new Date();
  const owned = await prisma.order.findFirst({ where: { id: params.orderId, organisationId: params.organisationId }, select: { id: true } });
  if (!owned) throw new PaymentOperationError("Order not found.");
  const pages = await closeOpenAttempts(owned.id, now);
  if (pages === "settled") return "already-paid";
  if (pages === "open") throw new PaymentOperationError("The buyer's payment page couldn't be closed yet. Try again in a minute.");

  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, owned.id);
    const order = await tx.order.findUniqueOrThrow({
      where: { id: owned.id },
      select: {
        id: true, status: true, buyerEmail: true, ...ORDER_SUBJECT_SELECT,
        payments: { where: { status: PaymentStatus.PENDING }, select: { id: true, provider: true } },
        rsvps: { select: { id: true, orderId: true, eventId: true, eventInstanceId: true, ticketTypeId: true, status: true, holdExpiresAt: true, checkInToken: true, guestEmail: true, user: { select: { email: true } } } },
      },
    });
    // Reserved to pay at the desk: the places are already confirmed; record the money.
    const desk = order.status === OrderStatus.CONFIRMED ? order.payments.find((payment) => payment.provider === "OFFLINE") : undefined;
    if (desk) {
      await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${desk.id} FOR UPDATE`;
      await tx.payment.update({
        where: { id: desk.id },
        data: params.mode === "offline"
          ? { status: PaymentStatus.PAID_OFFLINE, paidAt: now, offlineMethod: params.method ?? OfflinePaymentMethod.OTHER, offlineReference: params.reference?.trim().slice(0, 120) || null, settledByUserId: params.actorUserId }
          : { status: PaymentStatus.WAIVED, settledByUserId: params.actorUserId },
      });
      if (params.mode === "offline") await enqueuePaymentEmail(tx, { to: order.buyerEmail, paymentId: desk.id, notice: "paid" });
      await recordAuditEvent({ action: params.mode === "offline" ? "PAYMENT_COLLECTED_AT_DESK" : "PAYMENT_WAIVED", actorUserId: params.actorUserId, organisationId: params.organisationId, targetType: "Payment", targetId: desk.id, client: tx });
      return "confirmed" as const;
    }
    if (order.status === OrderStatus.CONFIRMED) return "already-paid" as const;
    const payment = order.payments[0];
    if (order.status !== OrderStatus.PENDING || !payment) throw new PaymentOperationError("Only orders waiting for payment can be settled by hand.");
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`;
    const held = order.rsvps.filter((rsvp) => rsvp.status === RsvpStatus.PENDING_PAYMENT);
    if (held.length === 0) throw new PaymentOperationError("This order has no tickets left to confirm.");
    if (!held.every((rsvp) => isActiveHold(rsvp, now)) && !(await hasFreeSeats(tx, held, now))) throw new PaymentOperationError("The hold ended and the places have gone.");

    await tx.paymentCheckoutAttempt.updateMany({ where: { paymentId: payment.id, status: CheckoutAttemptStatus.OPEN }, data: { status: CheckoutAttemptStatus.CANCELLED } });
    await tx.payment.update({
      where: { id: payment.id },
      data: params.mode === "offline"
        ? { status: PaymentStatus.PAID_OFFLINE, paidAt: now, offlineMethod: params.method ?? OfflinePaymentMethod.OTHER, offlineReference: params.reference?.trim().slice(0, 120) || null, settledByUserId: params.actorUserId }
        : { status: PaymentStatus.WAIVED, settledByUserId: params.actorUserId },
    });
    await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.CONFIRMED, holdExpiresAt: null, holdCapAt: null } });
    await tx.rSVP.updateMany({ where: { id: { in: held.map((rsvp) => rsvp.id) } }, data: { status: RsvpStatus.CONFIRMED, holdExpiresAt: null } });
    if (params.mode === "offline") await enqueuePaymentEmail(tx, { to: order.buyerEmail, paymentId: payment.id, notice: "paid" });
    // One ticket email per person (a pass's ticket page lists its other dates).
    const emailed = new Set<string>();
    for (const rsvp of held) {
      const to = attendeeEmail(rsvp);
      if (!to || emailed.has(to)) continue;
      emailed.add(to);
      await enqueueRsvpConfirmation(tx, { to, eventTitle: subjectTitle(order), status: RsvpStatus.CONFIRMED, checkInToken: rsvp.checkInToken });
    }
    if (held.some((rsvp) => !attendeeEmail(rsvp))) await enqueueOrderEmail(tx, { to: order.buyerEmail, orderId: order.id, notice: "attendee-details" });
    await recordAuditEvent({ action: params.mode === "offline" ? "PAYMENT_MARKED_PAID_OFFLINE" : "PAYMENT_WAIVED", actorUserId: params.actorUserId, organisationId: params.organisationId, targetType: "Payment", targetId: payment.id, client: tx });
    return "confirmed" as const;
  });
}

/**
 * Email the buyer a payment link: the same link again while seats are held,
 * or a fresh day-long hold for an order whose hold ended (if its places are
 * still free) or a request still waiting.
 */
export async function sendPaymentLink(params: { orderId: string; organisationId: string; actorUserId: string; now?: Date; }): Promise<"resent" | "reopened"> {
  const now = params.now ?? new Date();
  const order = await prisma.order.findFirst({
    where: { id: params.orderId, organisationId: params.organisationId },
    select: { id: true, status: true, holdExpiresAt: true, buyerEmail: true, payments: { where: { status: PaymentStatus.PENDING }, select: { id: true } } },
  });
  if (!order) throw new PaymentOperationError("Order not found.");
  if (order.status === OrderStatus.PENDING && order.holdExpiresAt && order.holdExpiresAt > now && order.payments[0]) {
    await enqueuePaymentEmail(prisma, { to: order.buyerEmail, paymentId: order.payments[0].id, notice: "pending" });
    await recordAuditEvent({ action: "PAYMENT_LINK_SENT", actorUserId: params.actorUserId, organisationId: params.organisationId, targetType: "Order", targetId: order.id });
    return "resent";
  }
  if (order.status === OrderStatus.REQUESTED) {
    await offerRequestedOrder(params);
    return "reopened";
  }
  if (order.status !== OrderStatus.EXPIRED) throw new PaymentOperationError("This order isn't waiting for payment.");
  const account = await onlineAccount(params.organisationId);
  await prisma.$transaction(async (tx) => {
    await lockOrder(tx, order.id);
    const current = await tx.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, totalMinor: true, currency: true, buyerEmail: true, ...ORDER_SUBJECT_SELECT, rsvps: { select: { id: true, orderId: true, eventId: true, eventInstanceId: true, ticketTypeId: true } } },
    });
    if (current.status !== OrderStatus.EXPIRED) throw new PaymentOperationError("This order was changed by someone else.");
    if (current.rsvps.length === 0) throw new PaymentOperationError("The buyer has registered again since this order expired.");
    if (current.totalMinor < providerMinimumMinor(account.provider, current.currency)) throw new PaymentOperationError("This order is below the smallest payment the provider accepts.");
    if (!(await hasFreeSeats(tx, current.rsvps, now))) throw new PaymentOperationError("Its places have gone since the hold ended.");
    const holdExpiresAt = new Date(now.getTime() + PAYMENT_LINK_HOLD_MS);
    await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.PENDING, holdExpiresAt, holdCapAt: new Date(holdExpiresAt.getTime() + HOLD_EXTENSION_CAP_MS), testMode: account.testMode } });
    await tx.rSVP.updateMany({ where: { orderId: order.id }, data: { status: RsvpStatus.PENDING_PAYMENT, holdExpiresAt } });
    const payment = await tx.payment.create({
      data: { organisationId: params.organisationId, orderId: order.id, amountMinor: current.totalMinor, currency: current.currency, provider: account.provider, testMode: account.testMode, description: subjectTitle(current).slice(0, 300) },
      select: { id: true },
    });
    await enqueuePaymentEmail(tx, { to: current.buyerEmail, paymentId: payment.id, notice: "pending" });
    await recordAuditEvent({ action: "PAYMENT_LINK_SENT", actorUserId: params.actorUserId, organisationId: params.organisationId, targetType: "Order", targetId: order.id, client: tx });
  });
  return "reopened";
}

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

/**
 * Correct how an offline payment was recorded. The payment row never
 * changes; each correction is an append-only amendment.
 */
export async function amendOfflinePayment(params: {
  paymentId: string;
  organisationId: string;
  actorUserId: string;
  method?: OfflinePaymentMethod;
  reference?: string | null;
  reason: string;
}) {
  const reason = params.reason.trim().slice(0, 500);
  if (!reason) throw new PaymentOperationError("Say why the record is being corrected.");
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: params.paymentId, organisationId: params.organisationId, status: PaymentStatus.PAID_OFFLINE },
      select: { id: true, offlineMethod: true, offlineReference: true, amendments: { orderBy: { createdAt: "asc" }, select: { field: true, newValue: true } } },
    });
    if (!payment) throw new PaymentOperationError("Only offline payments can be corrected.");
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`;
    const current = effectiveOfflineRecord(payment);
    const changes: Array<{ field: "offlineMethod" | "offlineReference"; oldValue: string | null; newValue: string | null; }> = [];
    if (params.method && params.method !== current.method) changes.push({ field: "offlineMethod", oldValue: current.method, newValue: params.method });
    const reference = params.reference === undefined ? current.reference : params.reference?.trim().slice(0, 120) || null;
    if (reference !== current.reference) changes.push({ field: "offlineReference", oldValue: current.reference, newValue: reference });
    if (changes.length === 0) throw new PaymentOperationError("Nothing changed.");
    await tx.paymentAmendment.createMany({ data: changes.map((change) => ({ paymentId: payment.id, ...change, reason, actorUserId: params.actorUserId })) });
    await recordAuditEvent({ action: "PAYMENT_AMENDED", actorUserId: params.actorUserId, organisationId: params.organisationId, targetType: "Payment", targetId: payment.id, metadata: { fields: changes.map((change) => change.field).join(",") }, client: tx });
  });
}
