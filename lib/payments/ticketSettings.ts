import "server-only";

import { OrderStatus, RsvpStatus, TicketTypeKind, type RefundPolicyKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isPaidEventsEnabled } from "@/lib/instanceSettings";
import { DEFAULT_CURRENCY } from "./money";
import { redeemingOrdersWhere } from "./promo";
import { configuredProvider, isProviderTestMode } from "./settings";

type Owner = { eventId: string; } | { eventSeriesId: string; };

/**
 * Tickets sold or being paid for, per ticket type: seats for event and date
 * tickets (across every date of a series), passes for passes.
 */
async function ticketTypeUsage(types: Array<{ id: string; kind: TicketTypeKind; }>, now: Date) {
  const usage = new Map<string, { confirmed: number; held: number; }>();
  const singles = types.filter((type) => type.kind === TicketTypeKind.SINGLE).map((type) => type.id);
  if (singles.length > 0) {
    const rows = await prisma.rSVP.groupBy({
      by: ["ticketTypeId", "status"],
      where: { ticketTypeId: { in: singles }, OR: [{ status: RsvpStatus.CONFIRMED }, { status: RsvpStatus.PENDING_PAYMENT, holdExpiresAt: { gt: now } }] },
      _count: { _all: true },
    });
    for (const row of rows) {
      const entry = usage.get(row.ticketTypeId!) ?? { confirmed: 0, held: 0 };
      if (row.status === RsvpStatus.CONFIRMED) entry.confirmed += row._count._all;
      else entry.held += row._count._all;
      usage.set(row.ticketTypeId!, entry);
    }
  }
  for (const type of types.filter((candidate) => candidate.kind === TicketTypeKind.PASS)) {
    const [confirmed, held] = await Promise.all([
      prisma.orderLine.aggregate({ _sum: { quantity: true }, where: { ticketTypeId: type.id, order: { status: OrderStatus.CONFIRMED } } }),
      prisma.orderLine.aggregate({ _sum: { quantity: true }, where: { ticketTypeId: type.id, order: { status: OrderStatus.PENDING, holdExpiresAt: { gt: now } } } }),
    ]);
    usage.set(type.id, { confirmed: confirmed._sum.quantity ?? 0, held: held._sum.quantity ?? 0 });
  }
  return usage;
}

/**
 * What the organiser's ticket settings show for an event or a series: its
 * ticket types, promo codes and refund policy, and whether paid tickets can
 * be sold (and to whose account the money goes).
 */
export async function loadTicketSettings(params: {
  owner: Owner;
  organisation: { id: string; name: string; };
  currency: string | null;
  refundPolicy: { refundPolicyKind: RefundPolicyKind; refundPolicyHours: number | null; refundPolicyPercent: number | null; refundPolicyText: string; };
  now: Date;
}) {
  const { owner, now } = params;
  const [types, settings, paidEnabled, promoCodes, sold] = await Promise.all([
    prisma.ticketType.findMany({
      where: { ...owner, archivedAt: null },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true, kind: true, name: true, description: true, priceMinor: true, capacity: true, minPerOrder: true, maxPerOrder: true, salesStartAt: true, salesEndAt: true,
        visibility: true, accessCodeHint: true, pricing: true, suggestedMinor: true, maxPriceMinor: true, seatsPerTicket: true, feeMinor: true,
      },
    }),
    prisma.organisationPaymentSettings.findUnique({ where: { organisationId: params.organisation.id } }),
    isPaidEventsEnabled(),
    prisma.promoCode.findMany({
      where: { ...owner, archivedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, hint: true, kind: true, appliesPer: true, percentOff: true, amountOffMinor: true, ticketTypeId: true, minQuantity: true, perOrderLimit: true, maxRedemptions: true, validFrom: true, validUntil: true },
    }),
    prisma.order.count({ where: { ...owner, totalMinor: { gt: 0 } } }),
  ]);
  const addOns = await prisma.addOn.findMany({ where: { ...owner, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, description: true, priceMinor: true, capacity: true, maxPerOrder: true } });
  const addOnSold = await Promise.all(addOns.map((addOn) => prisma.orderLine.aggregate({ _sum: { quantity: true }, where: { addOnId: addOn.id, order: { status: OrderStatus.CONFIRMED } } })));
  const [usage, uses] = await Promise.all([
    ticketTypeUsage(types, now),
    Promise.all(promoCodes.map((promo) => prisma.order.count({ where: redeemingOrdersWhere(promo.id, now) }))),
  ]);
  const provider = configuredProvider(settings);
  const paidBlockedReason = !paidEnabled
    ? "Paid tickets are turned off on this installation, so tickets are free."
    : !provider
      ? "To sell paid tickets, the organisation owner connects a Razorpay or Stripe account in Settings → Payments."
      : null;
  const currency = params.currency ?? settings?.currency ?? DEFAULT_CURRENCY;
  const policy = params.refundPolicy;
  return {
    tickets: types.map((type) => ({
      id: type.id,
      kind: type.kind,
      name: type.name,
      description: type.description,
      priceMinor: Number(type.priceMinor),
      currency,
      capacity: type.capacity,
      minPerOrder: type.minPerOrder,
      maxPerOrder: type.maxPerOrder,
      salesStartAt: type.salesStartAt?.toISOString() ?? null,
      salesEndAt: type.salesEndAt?.toISOString() ?? null,
      confirmed: usage.get(type.id)?.confirmed ?? 0,
      held: usage.get(type.id)?.held ?? 0,
      visibility: type.visibility,
      accessCodeHint: type.accessCodeHint,
      pricing: type.pricing,
      suggestedMinor: type.suggestedMinor == null ? null : Number(type.suggestedMinor),
      maxPriceMinor: type.maxPriceMinor == null ? null : Number(type.maxPriceMinor),
      seatsPerTicket: type.seatsPerTicket,
      feeMinor: Number(type.feeMinor),
    })),
    addOns: addOns.map((addOn, index) => ({ ...addOn, priceMinor: Number(addOn.priceMinor), sold: addOnSold[index]?._sum.quantity ?? 0 })),
    currency,
    paidAllowed: paidBlockedReason === null,
    paidBlockedReason,
    // Money always goes to the event's or series' own organisation; co-organisers can't change it.
    payee: paidBlockedReason === null && provider && settings
      ? { organisationName: params.organisation.name, provider: provider === "RAZORPAY" ? "Razorpay" : "Stripe", testMode: isProviderTestMode(settings, provider) }
      : null,
    promoCodes: promoCodes.map((promo, index) => ({
      ...promo,
      amountOffMinor: promo.amountOffMinor == null ? null : Number(promo.amountOffMinor),
      validFrom: promo.validFrom?.toISOString() ?? null,
      validUntil: promo.validUntil?.toISOString() ?? null,
      uses: uses[index] ?? 0,
    })),
    refundPolicy: { kind: policy.refundPolicyKind, hours: policy.refundPolicyHours, percent: policy.refundPolicyPercent, text: policy.refundPolicyText },
    sold: sold > 0,
  };
}
