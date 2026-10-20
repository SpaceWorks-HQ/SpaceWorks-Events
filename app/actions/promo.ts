"use server";

import { EventStatus } from "@prisma/client";
import { z } from "zod";
import type { ActionResult } from "@/app/actions/org";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { prisma } from "@/lib/db";
import { isValidPromoCode, promoCodeDigest, redeemingOrdersWhere } from "@/lib/payments/promo";

const schema = z.object({
  orgSlug: z.string().trim().min(1).max(120),
  eventSlug: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(32),
}).strict();

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
  const event = await prisma.event.findFirst({
    where: { slug: parsed.data.eventSlug, organisation: { slug: parsed.data.orgSlug }, status: EventStatus.PUBLISHED, page: { isPublished: true } },
    select: { id: true },
  });
  if (!event) return { ok: false, error: "That promo code isn't valid." };
  const now = new Date();
  const promo = await prisma.promoCode.findUnique({
    where: { eventId_codeDigest: { eventId: event.id, codeDigest: promoCodeDigest(parsed.data.code) } },
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
