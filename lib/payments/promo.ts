import crypto from "crypto";
import { OrderStatus, type Prisma } from "@prisma/client";
import type { PromoRule } from "./pricing";

/**
 * Promo codes are stored only as a SHA-256 digest of the normalised code,
 * with a three-character hint so organisers can tell them apart.
 */
export function normalizePromoCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidPromoCode(code: string) {
  return /^[A-Z0-9_-]{3,32}$/.test(normalizePromoCode(code));
}

export function promoCodeDigest(code: string) {
  return crypto.createHash("sha256").update(normalizePromoCode(code), "utf8").digest("hex");
}

export function promoCodeHint(code: string) {
  return `${normalizePromoCode(code).slice(0, 3)}…`;
}

/** A promo rule refused the code; the message is safe to show. */
export class PromoCodeError extends Error {}

/**
 * Orders that count as using a code: confirmed ones, live holds, and requests
 * still waiting (they keep the price they were quoted). A released hold or a
 * declined request frees its use.
 */
export function redeemingOrdersWhere(promoCodeId: string, now: Date): Prisma.OrderWhereInput {
  return { promoCodeId, OR: [{ status: { in: [OrderStatus.CONFIRMED, OrderStatus.REQUESTED] } }, { status: OrderStatus.PENDING, holdExpiresAt: { gt: now } }] };
}

/**
 * Find and lock a code for an order, under the event lock. Its redemption
 * limit therefore holds under concurrent orders. Returns the pricing rule;
 * the discount itself is applied by priceOrder.
 */
export async function lockPromoCode(tx: Prisma.TransactionClient, params: { eventId: string; code: string; now: Date; }): Promise<{ id: string; rule: PromoRule; }> {
  if (!isValidPromoCode(params.code)) throw new PromoCodeError("That promo code isn't valid.");
  const promo = await tx.promoCode.findUnique({
    where: { eventId_codeDigest: { eventId: params.eventId, codeDigest: promoCodeDigest(params.code) } },
    select: { id: true, archivedAt: true },
  });
  if (!promo || promo.archivedAt) throw new PromoCodeError("That promo code isn't valid.");
  await tx.$queryRaw`SELECT "id" FROM "PromoCode" WHERE "id" = ${promo.id} FOR UPDATE`;
  const locked = await tx.promoCode.findUniqueOrThrow({
    where: { id: promo.id },
    select: { kind: true, appliesPer: true, percentOff: true, amountOffMinor: true, ticketTypeId: true, minQuantity: true, perOrderLimit: true, maxRedemptions: true, validFrom: true, validUntil: true },
  });
  if ((locked.validFrom && locked.validFrom > params.now) || (locked.validUntil && locked.validUntil <= params.now)) throw new PromoCodeError("That promo code isn't valid right now.");
  if (locked.maxRedemptions != null && await tx.order.count({ where: redeemingOrdersWhere(promo.id, params.now) }) >= locked.maxRedemptions) {
    throw new PromoCodeError("That promo code has been used up.");
  }
  return {
    id: promo.id,
    rule: { kind: locked.kind, appliesPer: locked.appliesPer, percentOff: locked.percentOff, amountOffMinor: locked.amountOffMinor, ticketTypeId: locked.ticketTypeId, minQuantity: locked.minQuantity, perOrderLimit: locked.perOrderLimit },
  };
}
