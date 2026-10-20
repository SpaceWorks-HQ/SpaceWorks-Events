"use server";

import { EventStatus } from "@prisma/client";
import { z } from "zod";
import type { ActionResult } from "@/app/actions/org";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { prisma } from "@/lib/db";
import { DEFAULT_CURRENCY } from "@/lib/payments/money";
import { findPromoCode, isValidPromoCode, redeemingOrdersWhere } from "@/lib/payments/promo";
import { listPublicTicketTypes, type PublicTicketType, type TicketScope } from "@/lib/payments/tickets";

const schema = z.object({
  orgSlug: z.string().trim().min(1).max(120),
  /** An event, or a date of a series (whose codes cover its dates and passes). */
  eventSlug: z.string().trim().min(1).max(200).optional(),
  eventInstanceId: z.string().trim().min(1).max(128).optional(),
  code: z.string().trim().min(1).max(32),
}).strict().refine((value) => Boolean(value.eventSlug) !== Boolean(value.eventInstanceId));

/** A code's rule for the browser's price preview; amounts are strings because they are BigInt on the server. */
export type PromoPreview = {
  kind: "PERCENT" | "FIXED";
  appliesPer: "TICKET" | "ORDER";
  percentOff: number | null;
  amountOffMinor: string | null;
  ticketTypeId: string | null;
  minQuantity: number;
  perOrderLimit: number | null;
};

/**
 * Check a promo code while registering, so the form can show the discounted
 * total. The order is priced again under the lock when it is placed; this
 * only previews. Rate limited like registration, since it confirms a code.
 */
export async function checkPromoCode(input: unknown): Promise<ActionResult<PromoPreview>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success || !isValidPromoCode(parsed.data.code)) return { ok: false, error: "That promo code isn't valid." };
  if (await isActionRateLimited("rsvp")) return { ok: false, error: "Too many attempts. Try again shortly." };
  const owner = parsed.data.eventSlug
    ? await prisma.event.findFirst({
      where: { slug: parsed.data.eventSlug, organisation: { slug: parsed.data.orgSlug }, status: EventStatus.PUBLISHED, page: { isPublished: true } },
      select: { id: true },
    }).then((event) => (event ? { eventId: event.id } : null))
    : await prisma.eventInstance.findFirst({
      where: { id: parsed.data.eventInstanceId, cancelledAt: null, series: { organisation: { slug: parsed.data.orgSlug }, status: EventStatus.PUBLISHED } },
      select: { eventSeriesId: true },
    }).then((date) => (date ? { eventSeriesId: date.eventSeriesId } : null));
  if (!owner) return { ok: false, error: "That promo code isn't valid." };
  const now = new Date();
  const found = await findPromoCode(prisma, owner, parsed.data.code);
  const promo = found && await prisma.promoCode.findUnique({
    where: { id: found.id },
    select: { id: true, archivedAt: true, kind: true, appliesPer: true, percentOff: true, amountOffMinor: true, ticketTypeId: true, minQuantity: true, perOrderLimit: true, maxRedemptions: true, validFrom: true, validUntil: true },
  });
  if (!promo || promo.archivedAt) return { ok: false, error: "That promo code isn't valid." };
  if ((promo.validFrom && promo.validFrom > now) || (promo.validUntil && promo.validUntil <= now)) return { ok: false, error: "That promo code isn't valid right now." };
  if (promo.maxRedemptions != null && await prisma.order.count({ where: redeemingOrdersWhere(promo.id, now) }) >= promo.maxRedemptions) {
    return { ok: false, error: "That promo code has been used up." };
  }
  return {
    ok: true,
    data: {
      kind: promo.kind, appliesPer: promo.appliesPer, percentOff: promo.percentOff, amountOffMinor: promo.amountOffMinor?.toString() ?? null,
      ticketTypeId: promo.ticketTypeId, minQuantity: promo.minQuantity, perOrderLimit: promo.perOrderLimit,
    },
  };
}

const unlockSchema = z.object({
  orgSlug: z.string().trim().min(1).max(120),
  eventSlug: z.string().trim().min(1).max(200).optional(),
  eventInstanceId: z.string().trim().min(1).max(128).optional(),
  code: z.string().trim().min(1).max(32),
}).strict().refine((value) => Boolean(value.eventSlug) !== Boolean(value.eventInstanceId));

/**
 * The tickets an access code reveals on this event or series date. The
 * code is checked again when the order is placed. Rate limited, since it
 * confirms whether a code exists.
 */
export async function unlockTickets(input: unknown): Promise<ActionResult<PublicTicketType[]>> {
  const parsed = unlockSchema.safeParse(input);
  if (!parsed.success || !isValidPromoCode(parsed.data.code)) return { ok: false, error: "That access code isn't valid." };
  if (await isActionRateLimited("rsvp")) return { ok: false, error: "Too many attempts. Try again shortly." };
  const scope = parsed.data.eventSlug
    ? await prisma.event.findFirst({
      where: { slug: parsed.data.eventSlug, organisation: { slug: parsed.data.orgSlug }, status: EventStatus.PUBLISHED, page: { isPublished: true } },
      select: { id: true, currency: true },
    }).then((event) => (event ? { scope: { eventId: event.id } as TicketScope, currency: event.currency } : null))
    : await prisma.eventInstance.findFirst({
      where: { id: parsed.data.eventInstanceId, cancelledAt: null, series: { organisation: { slug: parsed.data.orgSlug }, status: EventStatus.PUBLISHED } },
      select: { id: true, eventSeriesId: true, series: { select: { currency: true } } },
    }).then((date) => (date ? { scope: { eventSeriesId: date.eventSeriesId, eventInstanceId: date.id } as TicketScope, currency: date.series.currency } : null));
  if (!scope) return { ok: false, error: "That access code isn't valid." };
  const tickets = (await listPublicTicketTypes(scope.scope, scope.currency ?? DEFAULT_CURRENCY, new Date(), { accessCode: parsed.data.code }))
    .filter((ticket) => ticket.visibility === "CODE");
  if (tickets.length === 0) return { ok: false, error: "That access code isn't valid." };
  return { ok: true, data: tickets };
}
