import { EventStatus, Prisma, RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueRsvpStatusNotification } from "@/lib/outbox";
import { seatTakingWhere } from "@/lib/payments/holds";

export async function countConfirmedForEvent(eventId: string): Promise<number> {
  return prisma.rSVP.count({
    where: { eventId, status: RsvpStatus.CONFIRMED },
  });
}

/** Paid-ticket seats currently held while buyers pay. */
export async function countHeldForEvent(eventId: string, now = new Date()): Promise<number> {
  return prisma.rSVP.count({
    where: { eventId, status: RsvpStatus.PENDING_PAYMENT, holdExpiresAt: { gt: now } },
  });
}

/** Registrations from a paid order are confirmed only by its payment. */
export const NOT_FROM_PAID_ORDER = { OR: [{ orderId: null }, { order: { totalMinor: 0 } }] } satisfies Prisma.RSVPWhereInput;

export async function countConfirmedForInstance(
  eventInstanceId: string,
): Promise<number> {
  return prisma.rSVP.count({
    where: { eventInstanceId, status: RsvpStatus.CONFIRMED },
  });
}

/** Caller must already be inside the restore transaction. Uses the same target
 * row lock as new reservations so an undo cannot race a final-slot claim. */
export async function hasCapacityToRestoreConfirmedRsvp(
  tx: Prisma.TransactionClient,
  target: { eventId: string } | { eventInstanceId: string },
): Promise<boolean> {
  let capacity: number | null;
  if ("eventId" in target) {
    const rows = await tx.$queryRaw<Array<{ capacity: number | null }>>`
      SELECT "capacity" FROM "Event" WHERE "id" = ${target.eventId} FOR UPDATE
    `;
    if (!rows[0]) return false;
    capacity = rows[0].capacity;
  } else {
    await tx.$queryRaw`SELECT "id" FROM "EventInstance" WHERE "id" = ${target.eventInstanceId} FOR UPDATE`;
    const instance = await tx.eventInstance.findUnique({
      where: { id: target.eventInstanceId },
      select: { series: { select: { capacity: true } } },
    });
    if (!instance) return false;
    capacity = instance.series.capacity;
  }
  if (capacity == null) return true;
  const taken = await tx.rSVP.count({ where: { ...target, ...seatTakingWhere(new Date()) } });
  return taken < capacity;
}

/** Atomically promote/approve an RSVP without exceeding the configured capacity. */
export async function confirmRsvpWithinCapacity(params: {
  rsvpId: string;
  eventId?: string;
  eventInstanceId?: string;
  expectedStatuses: RsvpStatus[];
  /** Approval requests must not be confirmed after their event has ended or been unpublished. */
  requireOpen?: boolean;
  notification?: { to: string; eventTitle: string; checkInToken: string };
}): Promise<"confirmed" | "full" | "changed" | "closed"> {
  const target = params.eventId ? { eventId: params.eventId } : { eventInstanceId: params.eventInstanceId! };
  return prisma.$transaction(async (tx) => {
    let capacity: number | null;
    let isOpen: boolean;
    if (params.eventId) {
      const events = await tx.$queryRaw<Array<{ capacity: number | null; status: EventStatus; endDateTime: Date }>>`
        SELECT "capacity", "status", "endDateTime" FROM "Event" WHERE "id" = ${params.eventId} FOR UPDATE
      `;
      const event = events[0];
      if (!event) return "changed";
      capacity = event.capacity;
      isOpen = event.status === EventStatus.PUBLISHED && event.endDateTime > new Date();
    } else {
      const instances = await tx.$queryRaw<Array<{ capacity: number | null; status: EventStatus; endDateTime: Date }>>`
        SELECT s."capacity", s."status", i."endDateTime"
        FROM "EventSeries" s
        INNER JOIN "EventInstance" i ON i."eventSeriesId" = s."id"
        WHERE i."id" = ${params.eventInstanceId}
        FOR UPDATE OF s, i
      `;
      const instance = instances[0];
      if (!instance) return "changed";
      capacity = instance.capacity;
      isOpen = instance.status === EventStatus.PUBLISHED && instance.endDateTime > new Date();
    }
    if (params.requireOpen && !isOpen) return "closed";
    const taken = await tx.rSVP.count({ where: { ...target, ...seatTakingWhere(new Date()) } });
    if (capacity != null && taken >= capacity) return "full";
    const updated = await tx.rSVP.updateMany({
      where: { id: params.rsvpId, ...target, status: { in: params.expectedStatuses }, ...NOT_FROM_PAID_ORDER },
      data: { status: RsvpStatus.CONFIRMED },
    });
    if (updated.count === 1 && params.notification) {
      await enqueueRsvpStatusNotification(tx, {
        ...params.notification,
        approved: true,
      });
    }
    return updated.count === 1 ? "confirmed" : "changed";
  });
}
