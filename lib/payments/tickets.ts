import { TicketTypeKind, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { seatTakingWhere } from "./holds";
import { passesTaken } from "./targets";

export type TicketSalesState = "on_sale" | "not_started" | "ended";

export function ticketSalesState(type: { salesStartAt: Date | null; salesEndAt: Date | null; }, now = new Date()): TicketSalesState {
  if (type.salesStartAt && type.salesStartAt > now) return "not_started";
  if (type.salesEndAt && type.salesEndAt <= now) return "ended";
  return "on_sale";
}

/** What the public event page shows for each ticket. Amounts are minor units. */
export type PublicTicketType = {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  minPerOrder: number;
  maxPerOrder: number;
  sales: TicketSalesState;
  salesStartAt: string | null;
  salesEndAt: string | null;
  /** Seats left of this type's own limit, or null when it has none. */
  remaining: number | null;
  /** A series pass: one seat on each of `passDates` remaining dates. */
  pass: boolean;
  passDates: number | null;
};

/** Tickets on sale for an event, or for one date of a series (with the series passes). */
export type TicketScope = { eventId: string; } | { eventSeriesId: string; eventInstanceId: string; };

/**
 * Active ticket types for an event or a series date, with seats left counted
 * the same way registration counts them (confirmed plus unexpired holds): per
 * date for date tickets, in passes for passes.
 */
export async function listPublicTicketTypes(scope: TicketScope, currency: string, now = new Date()): Promise<PublicTicketType[]> {
  const owner: Prisma.TicketTypeWhereInput = "eventId" in scope ? { eventId: scope.eventId } : { eventSeriesId: scope.eventSeriesId };
  const types = await prisma.ticketType.findMany({
    where: { ...owner, archivedAt: null },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, name: true, description: true, priceMinor: true, capacity: true, minPerOrder: true, maxPerOrder: true, salesStartAt: true, salesEndAt: true },
  });
  if (types.length === 0) return [];
  const seatScope: Prisma.RSVPWhereInput = "eventId" in scope ? { eventId: scope.eventId } : { eventInstanceId: scope.eventInstanceId };
  const taken = await prisma.rSVP.groupBy({
    by: ["ticketTypeId"],
    where: { ...seatScope, ticketTypeId: { in: types.map((type) => type.id) }, ...seatTakingWhere(now) },
    _count: { _all: true },
  });
  const takenByType = new Map(taken.map((row) => [row.ticketTypeId, row._count._all]));
  for (const type of types) {
    if (type.kind === TicketTypeKind.PASS && type.capacity != null) takenByType.set(type.id, await passesTaken(prisma, type.id, now));
  }
  const passDates = "eventSeriesId" in scope && types.some((type) => type.kind === TicketTypeKind.PASS)
    ? await prisma.eventInstance.count({ where: { eventSeriesId: scope.eventSeriesId, cancelledAt: null, endDateTime: { gt: now } } })
    : null;
  return types.map((type) => ({
    id: type.id,
    name: type.name,
    description: type.description,
    priceMinor: Number(type.priceMinor),
    currency,
    minPerOrder: type.minPerOrder,
    maxPerOrder: type.maxPerOrder,
    sales: ticketSalesState(type, now),
    salesStartAt: type.salesStartAt?.toISOString() ?? null,
    salesEndAt: type.salesEndAt?.toISOString() ?? null,
    remaining: type.capacity == null ? null : Math.max(0, type.capacity - (takenByType.get(type.id) ?? 0)),
    pass: type.kind === TicketTypeKind.PASS,
    passDates: type.kind === TicketTypeKind.PASS ? passDates : null,
  }));
}
