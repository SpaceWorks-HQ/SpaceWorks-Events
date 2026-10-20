import { prisma } from "@/lib/db";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { isPaidEventsEnabled } from "@/lib/instanceSettings";
import { DEFAULT_CURRENCY } from "@/lib/payments/money";
import { redeemingOrdersWhere } from "@/lib/payments/promo";
import { configuredProvider } from "@/lib/payments/settings";
import { ticketTypeUsage } from "@/lib/payments/tickets";

/** Ticket types are an organisation owner/admin concern, like the actions that change them. */
async function loadTickets(ctx: EventDashboardContext) {
  if (!ctx.permissions.canEditTickets) return null;
  const [types, usage, settings, paidEnabled, promoCodes, sold, policy] = await Promise.all([
    prisma.ticketType.findMany({
      where: { eventId: ctx.event.id, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, description: true, priceMinor: true, capacity: true, minPerOrder: true, maxPerOrder: true, salesStartAt: true, salesEndAt: true },
    }),
    ticketTypeUsage(ctx.event.id, ctx.now),
    prisma.organisationPaymentSettings.findUnique({ where: { organisationId: ctx.organisation.id } }),
    isPaidEventsEnabled(),
    prisma.promoCode.findMany({
      where: { eventId: ctx.event.id, archivedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, hint: true, kind: true, appliesPer: true, percentOff: true, amountOffMinor: true, ticketTypeId: true, minQuantity: true, perOrderLimit: true, maxRedemptions: true, validFrom: true, validUntil: true },
    }),
    prisma.order.count({ where: { eventId: ctx.event.id, totalMinor: { gt: 0 } } }),
    prisma.event.findUniqueOrThrow({ where: { id: ctx.event.id }, select: { refundPolicyKind: true, refundPolicyHours: true, refundPolicyPercent: true, refundPolicyText: true } }),
  ]);
  const uses = await Promise.all(promoCodes.map((promo) => prisma.order.count({ where: redeemingOrdersWhere(promo.id, ctx.now) })));
  const connected = configuredProvider(settings) !== null;
  const paidBlockedReason = !paidEnabled
    ? "Paid tickets are turned off on this installation, so tickets are free."
    : !connected
      ? "To sell paid tickets, the organisation owner connects a Razorpay or Stripe account in Settings → Payments."
      : null;
  return {
    tickets: types.map((type) => ({
      id: type.id,
      name: type.name,
      description: type.description,
      priceMinor: Number(type.priceMinor),
      currency: ctx.event.currency ?? settings?.currency ?? DEFAULT_CURRENCY,
      capacity: type.capacity,
      minPerOrder: type.minPerOrder,
      maxPerOrder: type.maxPerOrder,
      salesStartAt: type.salesStartAt?.toISOString() ?? null,
      salesEndAt: type.salesEndAt?.toISOString() ?? null,
      confirmed: usage.get(type.id)?.confirmed ?? 0,
      held: usage.get(type.id)?.held ?? 0,
    })),
    currency: ctx.event.currency ?? settings?.currency ?? DEFAULT_CURRENCY,
    paidAllowed: paidBlockedReason === null,
    paidBlockedReason,
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

export async function loadSettingsPanel({ ctx }: { ctx: EventDashboardContext; }) {
  ctx = await loadEventDashboard(ctx.organisation.slug, ctx.event.id);
  const { event, permissions, organisation } = ctx;
  const [collaborators, pending] = permissions.canManageCollaborators
    ? await Promise.all([
      prisma.eventCollaborator.findMany({ where: { eventId: event.id }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
      prisma.eventCollaboratorInvite.findMany({ where: { eventId: event.id, usedAt: null, expiresAt: { gt: ctx.now } }, select: { id: true, email: true, expiresAt: true, permissions: true }, orderBy: { createdAt: "desc" } }),
    ])
    : [[], []];
  const tickets = await loadTickets(ctx);
  return { permissions, organisation, event, collaborators, pending, tickets };
}

import { loadEventDashboard } from "@/lib/eventDashboard/context";
