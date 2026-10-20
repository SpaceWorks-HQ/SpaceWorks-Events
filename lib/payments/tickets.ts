import { OrderStatus, TicketTypeKind, TicketVisibility, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { seatTakingWhere } from "./holds";
import { isValidPromoCode, promoCodeDigest } from "./promo";
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
  /** FIXED: the price. FLEXIBLE: the least a buyer may pay. */
  priceMinor: number;
  currency: string;
  minPerOrder: number;
  maxPerOrder: number;
  sales: TicketSalesState;
  salesStartAt: string | null;
  salesEndAt: string | null;
  /** Tickets left of this type's own limit, or null when it has none. */
  remaining: number | null;
  /** A series pass: one seat on each of `passDates` remaining dates. */
  pass: boolean;
  passDates: number | null;
  /** Pay what you want, from priceMinor up to maxPriceMinor. */
  flexible: boolean;
  suggestedMinor: number | null;
  maxPriceMinor: number | null;
  /** A group ticket seats this many people. */
  seatsPerTicket: number;
  feeMinor: number;
  /** Shown because of an access code, or to members only. */
  visibility: "PUBLIC" | "CODE" | "MEMBERS";
};

/** Something to buy alongside tickets. */
export type PublicAddOn = { id: string; name: string; description: string; priceMinor: number; currency: string; maxPerOrder: number; remaining: number | null; };

/** Tickets on sale for an event, or for one date of a series (with the series passes). */
export type TicketScope = { eventId: string; } | { eventSeriesId: string; eventInstanceId: string; };

/** Who is looking: members see members-only tickets; an access code reveals its tickets. */
export type TicketViewer = { member?: boolean; accessCode?: string | null; };

/**
 * Active ticket types for an event or a series date that this viewer may
 * see, with what's left counted the same way registration counts it
 * (confirmed plus unexpired holds): per date for date tickets, in tickets
 * for group tickets, in passes for passes.
 */
export async function listPublicTicketTypes(scope: TicketScope, currency: string, now = new Date(), viewer: TicketViewer = {}): Promise<PublicTicketType[]> {
  const owner: Prisma.TicketTypeWhereInput = "eventId" in scope ? { eventId: scope.eventId } : { eventSeriesId: scope.eventSeriesId };
  const code = viewer.accessCode?.trim();
  const digest = code && isValidPromoCode(code) ? promoCodeDigest(code) : null;
  const visible: Prisma.TicketTypeWhereInput[] = [
    { visibility: TicketVisibility.PUBLIC },
    ...(viewer.member ? [{ visibility: TicketVisibility.MEMBERS }] : []),
    ...(digest ? [{ visibility: TicketVisibility.CODE, accessCodeDigest: digest }] : []),
  ];
  const types = await prisma.ticketType.findMany({
    where: { ...owner, archivedAt: null, OR: visible },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, kind: true, name: true, description: true, priceMinor: true, capacity: true, minPerOrder: true, maxPerOrder: true, salesStartAt: true, salesEndAt: true,
      pricing: true, suggestedMinor: true, maxPriceMinor: true, seatsPerTicket: true, feeMinor: true, visibility: true,
    },
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
    else if (type.seatsPerTicket > 1) takenByType.set(type.id, Math.ceil((takenByType.get(type.id) ?? 0) / type.seatsPerTicket));
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
    flexible: type.pricing === "FLEXIBLE",
    suggestedMinor: type.suggestedMinor == null ? null : Number(type.suggestedMinor),
    maxPriceMinor: type.maxPriceMinor == null ? null : Number(type.maxPriceMinor),
    seatsPerTicket: type.seatsPerTicket,
    feeMinor: Number(type.feeMinor),
    visibility: type.visibility,
  }));
}

/** Add-ons on sale for an event or series, with what's left. */
export async function listPublicAddOns(owner: { eventId: string; } | { eventSeriesId: string; }, currency: string, now = new Date()): Promise<PublicAddOn[]> {
  const addOns = await prisma.addOn.findMany({
    where: { ...owner, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, description: true, priceMinor: true, capacity: true, maxPerOrder: true },
  });
  return Promise.all(addOns.map(async (addOn) => {
    const sold = addOn.capacity == null ? null : await prisma.orderLine.aggregate({
      _sum: { quantity: true },
      where: { addOnId: addOn.id, order: { OR: [{ status: OrderStatus.CONFIRMED }, { status: OrderStatus.PENDING, holdExpiresAt: { gt: now } }] } },
    });
    return {
      id: addOn.id, name: addOn.name, description: addOn.description, priceMinor: Number(addOn.priceMinor), currency, maxPerOrder: addOn.maxPerOrder,
      remaining: addOn.capacity == null ? null : Math.max(0, addOn.capacity - (sold?._sum.quantity ?? 0)),
    };
  }));
}
