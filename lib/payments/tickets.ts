import { RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { seatTakingWhere } from "./holds";

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
};

/**
 * Active ticket types for a standalone event, with seats left counted the
 * same way registration counts them (confirmed plus unexpired holds).
 */
export async function listPublicTicketTypes(eventId: string, currency: string, now = new Date()): Promise<PublicTicketType[]> {
  const types = await prisma.ticketType.findMany({
    where: { eventId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, description: true, priceMinor: true, capacity: true, minPerOrder: true, maxPerOrder: true, salesStartAt: true, salesEndAt: true },
  });
  if (types.length === 0) return [];
  const taken = await prisma.rSVP.groupBy({
    by: ["ticketTypeId"],
    where: { eventId, ticketTypeId: { in: types.map((type) => type.id) }, ...seatTakingWhere(now) },
    _count: { _all: true },
  });
  const takenByType = new Map(taken.map((row) => [row.ticketTypeId, row._count._all]));
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
  }));
}

/** Confirmed-or-held counts per ticket type, for the organiser's ticket list. */
export async function ticketTypeUsage(eventId: string, now = new Date()) {
  const rows = await prisma.rSVP.groupBy({
    by: ["ticketTypeId", "status"],
    where: { eventId, ticketTypeId: { not: null }, OR: [{ status: RsvpStatus.CONFIRMED }, { status: RsvpStatus.PENDING_PAYMENT, holdExpiresAt: { gt: now } }] },
    _count: { _all: true },
  });
  const usage = new Map<string, { confirmed: number; held: number; }>();
  for (const row of rows) {
    const entry = usage.get(row.ticketTypeId!) ?? { confirmed: 0, held: 0 };
    if (row.status === RsvpStatus.CONFIRMED) entry.confirmed += row._count._all;
    else entry.held += row._count._all;
    usage.set(row.ticketTypeId!, entry);
  }
  return usage;
}
