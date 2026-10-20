/**
 * Order pricing: pure and client-safe, so the browser can preview a total
 * with exactly the rules the server applies under its lock. The provider
 * only ever charges the total this produces.
 */

export type PricedTicketType = {
  id: string;
  name: string;
  priceMinor: bigint;
  minPerOrder: number;
  maxPerOrder: number;
};

export type OrderItem = { ticketTypeId: string; quantity: number; };

/** A promo code's rule, as stored (the code itself is never needed to price). */
export type PromoRule = {
  kind: "PERCENT" | "FIXED";
  appliesPer: "TICKET" | "ORDER";
  percentOff: number | null;
  amountOffMinor: bigint | null;
  ticketTypeId: string | null;
  minQuantity: number;
  perOrderLimit: number | null;
};

export type PricedLine = {
  kind: "TICKET";
  ticketTypeId: string;
  description: string;
  quantity: number;
  unitMinor: bigint;
  discountMinor: bigint;
  totalMinor: bigint;
};

export type PricedOrder = {
  lines: PricedLine[];
  subtotalMinor: bigint;
  discountMinor: bigint;
  totalMinor: bigint;
  /** Seats the order takes: one per ticket. */
  seats: number;
};

/** A pricing rule refused the order; the message is safe to show. */
export class PricingError extends Error {}

export const MAX_TICKETS_PER_ORDER = 20;
const ZERO = BigInt(0);

/** Merge repeated ticket types and drop zero quantities. */
export function normalizeItems(items: OrderItem[]): OrderItem[] {
  const merged = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 0) throw new PricingError("Choose how many tickets you want.");
    if (item.quantity > 0) merged.set(item.ticketTypeId, (merged.get(item.ticketTypeId) ?? 0) + item.quantity);
  }
  return [...merged].map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
}

const HUNDRED = BigInt(100);

function percentOf(amount: bigint, percent: number) {
  return (amount * BigInt(percent)) / HUNDRED; // rounds down: never more than the stated discount
}

/**
 * Apply a promo code to priced lines. Per ticket: each discounted ticket
 * gets the percentage or fixed amount off (up to `perOrderLimit` tickets).
 * Per order: the discount comes off the eligible subtotal once, spread over
 * the eligible lines in proportion, with the remainder on the last line.
 * A discount never exceeds what it applies to.
 */
function applyPromo(lines: PricedLine[], promo: PromoRule) {
  const eligible = lines.filter((line) => line.unitMinor > ZERO && (!promo.ticketTypeId || line.ticketTypeId === promo.ticketTypeId));
  if (eligible.length === 0) throw new PricingError("That promo code doesn't apply to these tickets.");
  const eligibleQuantity = eligible.reduce((sum, line) => sum + line.quantity, 0);
  if (eligibleQuantity < promo.minQuantity) throw new PricingError(`That promo code needs at least ${promo.minQuantity} eligible tickets.`);
  if (promo.appliesPer === "TICKET") {
    let units = promo.perOrderLimit ?? Number.POSITIVE_INFINITY;
    for (const line of eligible) {
      const count = Math.min(line.quantity, units);
      if (count <= 0) break;
      units -= count;
      const perUnit = promo.kind === "PERCENT" ? percentOf(line.unitMinor, promo.percentOff ?? 0) : (promo.amountOffMinor ?? ZERO) > line.unitMinor ? line.unitMinor : promo.amountOffMinor ?? ZERO;
      line.discountMinor = perUnit * BigInt(count);
    }
  } else {
    const base = eligible.reduce((sum, line) => sum + line.unitMinor * BigInt(line.quantity), ZERO);
    const wanted = promo.kind === "PERCENT" ? percentOf(base, promo.percentOff ?? 0) : promo.amountOffMinor ?? ZERO;
    const total = wanted > base ? base : wanted;
    let left = total;
    eligible.forEach((line, index) => {
      const lineBase = line.unitMinor * BigInt(line.quantity);
      const share = index === eligible.length - 1 ? left : (total * lineBase) / base;
      line.discountMinor = share > lineBase ? lineBase : share;
      left -= line.discountMinor;
    });
  }
  for (const line of lines) line.totalMinor = line.unitMinor * BigInt(line.quantity) - line.discountMinor;
}

export function priceOrder(items: OrderItem[], types: PricedTicketType[], promo?: PromoRule | null): PricedOrder {
  const normalized = normalizeItems(items);
  if (normalized.length === 0) throw new PricingError("Choose at least one ticket.");
  const seats = normalized.reduce((sum, item) => sum + item.quantity, 0);
  if (seats > MAX_TICKETS_PER_ORDER) throw new PricingError(`You can buy up to ${MAX_TICKETS_PER_ORDER} tickets at a time.`);
  const lines: PricedLine[] = normalized.map((item) => {
    const type = types.find((candidate) => candidate.id === item.ticketTypeId);
    if (!type) throw new PricingError("That ticket is no longer available.");
    if (item.quantity < type.minPerOrder) throw new PricingError(`${type.name}: choose at least ${type.minPerOrder}.`);
    if (item.quantity > type.maxPerOrder) throw new PricingError(`${type.name}: up to ${type.maxPerOrder} per order.`);
    const total = type.priceMinor * BigInt(item.quantity);
    return { kind: "TICKET", ticketTypeId: type.id, description: type.name, quantity: item.quantity, unitMinor: type.priceMinor, discountMinor: ZERO, totalMinor: total };
  });
  if (promo) applyPromo(lines, promo);
  const subtotal = lines.reduce((sum, line) => sum + line.unitMinor * BigInt(line.quantity), ZERO);
  const discount = lines.reduce((sum, line) => sum + line.discountMinor, ZERO);
  return { lines, subtotalMinor: subtotal, discountMinor: discount, totalMinor: subtotal - discount, seats };
}

/** The line names a buyer sees on the provider's page. */
export function checkoutLineName(line: { description: string; quantity: number; }) {
  return line.quantity > 1 ? `${line.description} × ${line.quantity}` : line.description;
}
