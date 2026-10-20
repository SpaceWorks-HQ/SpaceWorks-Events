import "server-only";

import { OrderStatus, RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { PaymentOperationError, refundOrder } from "./operations";

/**
 * An event was cancelled: every paid order is refunded in full and its
 * tickets cancelled (the buyer is emailed), orders still being paid for are
 * released, and requests are declined. Run after the cancellation is saved;
 * a retry only finds orders not yet handled, so nothing is refunded twice.
 * An order someone already checked in on is left for the organiser.
 */
export async function refundCancelledEvent(params: { eventId: string; organisationId: string; actorUserId: string; now?: Date; }) {
  const now = params.now ?? new Date();
  const orders = await prisma.order.findMany({
    // Free orders need no refund: their guests are told the event is off.
    where: { eventId: params.eventId, organisationId: params.organisationId, totalMinor: { gt: 0 }, status: { in: [OrderStatus.CONFIRMED, OrderStatus.PENDING, OrderStatus.REQUESTED] } },
    select: { id: true, status: true },
  });
  let refunded = 0;
  let failed = 0;
  for (const order of orders) {
    try {
      if (order.status === OrderStatus.CONFIRMED) {
        await refundOrder({ orderId: order.id, organisationId: params.organisationId, actorUserId: params.actorUserId, amountMinor: null, reason: "Event cancelled", cancelTickets: true, now });
        refunded += 1;
      } else if (order.status === OrderStatus.PENDING) {
        // Ending the hold lets the scheduler close the payment page, then release the order.
        await prisma.$transaction([
          prisma.order.updateMany({ where: { id: order.id, status: OrderStatus.PENDING }, data: { holdExpiresAt: now } }),
          prisma.rSVP.updateMany({ where: { orderId: order.id, status: RsvpStatus.PENDING_PAYMENT }, data: { holdExpiresAt: now } }),
        ]);
      } else {
        await prisma.$transaction([
          prisma.order.updateMany({ where: { id: order.id, status: OrderStatus.REQUESTED }, data: { status: OrderStatus.CANCELLED } }),
          prisma.rSVP.deleteMany({ where: { orderId: order.id } }),
        ]);
      }
    } catch (error) {
      if (!(error instanceof PaymentOperationError)) throw error;
      failed += 1;
    }
  }
  await recordAuditEvent({ action: "EVENT_CANCELLED_REFUNDS", actorUserId: params.actorUserId, organisationId: params.organisationId, targetType: "Event", targetId: params.eventId, metadata: { orders: orders.length, refunded, failed } });
  return { refunded, failed };
}

/** Whether people have paid for (or are paying for) this event, so it must be cancelled rather than deleted. */
export async function hasPaidOrders(owner: { eventId: string; } | { eventSeriesId: string; }) {
  return (await prisma.order.count({ where: { ...owner, totalMinor: { gt: 0 }, status: { in: [OrderStatus.CONFIRMED, OrderStatus.PENDING, OrderStatus.REQUESTED] } } })) > 0;
}
