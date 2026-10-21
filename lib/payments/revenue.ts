import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { summariseRevenue, type RevenueOrder, type RevenueSummary } from "./revenueMetrics";

export const REVENUE_ORDER_SELECT = {
  id: true, status: true, currency: true, totalMinor: true, discountMinor: true, holdExpiresAt: true, createdAt: true,
  lines: { select: { kind: true, ticketTypeId: true, description: true, quantity: true, totalMinor: true } },
  payments: {
    select: {
      status: true, provider: true, amountMinor: true, testMode: true, paidAt: true, offlineMethod: true,
      refunds: { select: { amountMinor: true, status: true, automatic: true } },
      disputes: { select: { status: true, amountMinor: true } },
    },
  },
} satisfies Prisma.OrderSelect;

/** Revenue for an event or a series (one currency each). Null when nothing was ever sold. */
export async function loadRevenue(owner: { eventId: string; } | { eventSeriesId: string; } | { eventInstanceId: string; }, timeZone: string, now = new Date()): Promise<RevenueSummary | null> {
  const orders = await prisma.order.findMany({ where: { ...owner, totalMinor: { gt: 0 } }, select: REVENUE_ORDER_SELECT });
  if (orders.length === 0) return null;
  return summariseRevenue(orders as RevenueOrder[], { now, timeZone });
}

/**
 * An organisation's revenue over a window, per currency, with its events and
 * series ranked by net takings.
 */
export async function loadOrganisationRevenue(organisationId: string, options: { since: Date; timeZone: string; now?: Date; }) {
  const now = options.now ?? new Date();
  const orders = await prisma.order.findMany({
    where: { organisationId, totalMinor: { gt: 0 }, createdAt: { gte: options.since } },
    select: {
      ...REVENUE_ORDER_SELECT,
      event: { select: { id: true, title: true } },
      series: { select: { id: true, title: true } },
    },
  });
  if (orders.length === 0) return [];
  const byCurrency = new Map<string, typeof orders>();
  for (const order of orders) byCurrency.set(order.currency, [...(byCurrency.get(order.currency) ?? []), order]);
  return [...byCurrency.entries()].map(([currency, group]) => {
    const summary = summariseRevenue(group as RevenueOrder[], { now, timeZone: options.timeZone, days: 30 });
    const bySource = new Map<string, { title: string; href: string; orders: typeof group; }>();
    for (const order of group) {
      const source = order.event
        ? { key: `e:${order.event.id}`, title: order.event.title, href: `event/${order.event.id}` }
        : order.series ? { key: `s:${order.series.id}`, title: order.series.title, href: `series/${order.series.id}` } : null;
      if (!source) continue;
      const entry = bySource.get(source.key) ?? { title: source.title, href: source.href, orders: [] };
      entry.orders.push(order);
      bySource.set(source.key, entry);
    }
    const top = [...bySource.values()]
      .map((entry) => {
        const each = summariseRevenue(entry.orders as RevenueOrder[], { now, timeZone: options.timeZone, days: 1 });
        return { title: entry.title, href: entry.href, netMinor: each.netMinor, paidOrders: each.orders.paid };
      })
      .sort((a, b) => b.netMinor - a.netMinor)
      .slice(0, 5);
    return { currency, summary, top };
  });
}
