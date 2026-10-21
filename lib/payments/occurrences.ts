import "server-only";

import { OrderStatus, PaymentStatus, RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { noticeEach, noticeSubject, titleWith } from "@/lib/notices";
import { peopleWithPlaces } from "./eventCancellation";
import { seatTakingWhere } from "./holds";
import { PaymentOperationError, refundOrder } from "./operations";
import { lockSeriesDates } from "./targets";

const ZERO = BigInt(0);
const COLLECTED: PaymentStatus[] = [PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_OFFLINE];

async function ownedDate(organisationId: string, seriesId: string, instanceId: string) {
  const date = await prisma.eventInstance.findFirst({
    where: { id: instanceId, eventSeriesId: seriesId, series: { organisationId } },
    select: { id: true, eventSeriesId: true, startDateTime: true, endDateTime: true, cancelledAt: true, series: { select: { title: true, timezone: true } } },
  });
  if (!date) throw new PaymentOperationError("Date not found.");
  return date;
}

/**
 * Give one date its own capacity, or clear it to use the series capacity.
 * Never below the seats already taken (confirmed, or held while paying).
 */
export async function setOccurrenceCapacity(params: { organisationId: string; seriesId: string; instanceId: string; capacity: number | null; actorUserId: string; now?: Date; }) {
  const now = params.now ?? new Date();
  const date = await ownedDate(params.organisationId, params.seriesId, params.instanceId);
  await prisma.$transaction(async (tx) => {
    await lockSeriesDates(tx, date.eventSeriesId, [date.id], now);
    if (params.capacity != null) {
      const taken = await tx.rSVP.count({ where: { eventInstanceId: date.id, ...seatTakingWhere(now) } });
      if (taken > params.capacity) throw new PaymentOperationError(`${taken} places are already taken on this date.`);
    }
    await tx.eventInstance.update({ where: { id: date.id }, data: { capacity: params.capacity } });
    await recordAuditEvent({ action: "EVENT_INSTANCE_CAPACITY_UPDATED", actorUserId: params.actorUserId, organisationId: params.organisationId, targetType: "EventInstance", targetId: date.id, metadata: { capacity: params.capacity }, client: tx });
  });
}

/**
 * Cancel one date of a series. It stops taking registrations at once; then
 * every order with seats on it is settled:
 * - an order for this date alone is refunded in full and cancelled;
 * - a pass is refunded this date's share of what is left on it (what's left,
 *   times its seats on this date, over all its seats), and loses this date;
 * - an order still being paid for is released, and a request is declined.
 * Free registrations are removed. Everyone on the date is told by email.
 * Refunds are sent after the date is marked cancelled, so a retry never
 * refunds twice: each order is only handled while it still has seats here.
 */
export async function cancelOccurrence(params: { organisationId: string; seriesId: string; instanceId: string; actorUserId: string; reason: string; now?: Date; }) {
  const now = params.now ?? new Date();
  const date = await ownedDate(params.organisationId, params.seriesId, params.instanceId);
  if (date.endDateTime <= now) throw new PaymentOperationError("This date has already happened.");
  const label = titleWith(date.series.title, date.startDateTime.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: date.series.timezone }));

  const notified = await prisma.$transaction(async (tx) => {
    await lockSeriesDates(tx, date.eventSeriesId, [date.id], now);
    const current = await tx.eventInstance.findUniqueOrThrow({ where: { id: date.id }, select: { cancelledAt: true } });
    if (!current.cancelledAt) {
      await tx.eventInstance.update({ where: { id: date.id }, data: { cancelledAt: now } });
      await recordAuditEvent({ action: "EVENT_INSTANCE_CANCELLED", actorUserId: params.actorUserId, organisationId: params.organisationId, targetType: "EventInstance", targetId: date.id, client: tx });
    }
    // Everyone is told before anything is removed, in this transaction, so a
    // retry can never lose the notices. A retry that finds the date already
    // cancelled has told them.
    const told = current.cancelledAt ? 0 : await noticeEach(tx, await peopleWithPlaces(tx, { eventInstanceId: date.id }), {
      organisationId: params.organisationId,
      subject: noticeSubject("Cancelled", label),
      lines: [
        `${label} has been cancelled by the organiser.`,
        ...(params.reason ? [params.reason] : []),
        "If you paid, your refund is on its way: card and UPI refunds can take 5 to 10 working days to appear. A pass keeps its other dates.",
      ],
    });
    // Free registrations simply go; paid ones are handled with their orders below.
    await tx.rSVP.deleteMany({ where: { eventInstanceId: date.id, OR: [{ orderId: null }, { order: { totalMinor: ZERO } }] } });
    return told;
  });

  const orders = await prisma.order.findMany({
    where: { rsvps: { some: { eventInstanceId: date.id } } },
    select: { id: true, status: true, eventInstanceId: true, payments: { where: { status: { in: COLLECTED } }, select: { id: true } } },
  });
  let refunded = 0;
  let failed = 0;
  for (const order of orders) {
    try {
      if (order.status === OrderStatus.CONFIRMED) {
        if (order.eventInstanceId === date.id) {
          await refundOrder({ orderId: order.id, organisationId: params.organisationId, actorUserId: params.actorUserId, amountMinor: null, reason: `Date cancelled: ${params.reason}`.slice(0, 500), cancelTickets: true, now });
        } else {
          await refundPassShare({ orderId: order.id, instanceId: date.id, organisationId: params.organisationId, actorUserId: params.actorUserId, reason: params.reason, now });
        }
        refunded += 1;
      } else if (order.status === OrderStatus.PENDING) {
        // Ending the hold lets the scheduler close the payment page, then release the order.
        await prisma.$transaction([
          prisma.order.updateMany({ where: { id: order.id, status: OrderStatus.PENDING }, data: { holdExpiresAt: now } }),
          prisma.rSVP.updateMany({ where: { orderId: order.id, status: RsvpStatus.PENDING_PAYMENT }, data: { holdExpiresAt: now } }),
        ]);
      } else if (order.status === OrderStatus.REQUESTED) {
        await prisma.$transaction([
          prisma.order.updateMany({ where: { id: order.id, status: OrderStatus.REQUESTED }, data: { status: OrderStatus.CANCELLED } }),
          prisma.rSVP.deleteMany({ where: { orderId: order.id } }),
        ]);
      }
    } catch (error) {
      // For example a guest already checked in: the organiser settles that order by hand.
      if (!(error instanceof PaymentOperationError)) throw error;
      failed += 1;
    }
  }

  return { orders: orders.length, refunded, failed, notified };
}

/** A pass loses one date: refund that date's share of what's left on it, then remove its seats there. */
async function refundPassShare(params: { orderId: string; instanceId: string; organisationId: string; actorUserId: string; reason: string; now: Date; }) {
  const [onDate, all, payments] = await Promise.all([
    prisma.rSVP.count({ where: { orderId: params.orderId, eventInstanceId: params.instanceId } }),
    prisma.rSVP.count({ where: { orderId: params.orderId } }),
    prisma.payment.findMany({ where: { orderId: params.orderId, status: { in: COLLECTED } }, select: { amountMinor: true, refunds: { where: { status: { in: ["PENDING", "SUCCEEDED"] } }, select: { amountMinor: true } } } }),
  ]);
  if (onDate === 0 || all === 0) return;
  const left = payments.reduce((sum, payment) => sum + payment.amountMinor - payment.refunds.reduce((refunds, refund) => refunds + refund.amountMinor, ZERO), ZERO);
  const share = (left * BigInt(onDate)) / BigInt(all);
  if (share > ZERO) {
    await refundOrder({ orderId: params.orderId, organisationId: params.organisationId, actorUserId: params.actorUserId, amountMinor: share, reason: `Date cancelled: ${params.reason}`.slice(0, 500), cancelTickets: false, now: params.now });
  }
  await prisma.rSVP.deleteMany({ where: { orderId: params.orderId, eventInstanceId: params.instanceId, checkedInAt: null } });
}
