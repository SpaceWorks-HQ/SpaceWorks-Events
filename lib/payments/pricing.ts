/**
 * Order pricing: pure and client-safe, so the browser can preview a total
 * with exactly the rules the server applies under its lock. The provider
 * only ever charges the total this produces.
 */

export type PricedTicketType = {
  id: string;
  name: string;
  /** FIXED: the price. FLEXIBLE: the least a buyer may pay (0 allows free). */
  priceMinor: bigint;
  minPerOrder: number;
  maxPerOrder: number;
  pricing?: "FIXED" | "FLEXIBLE";
  maxPriceMinor?: bigint | null;
  /** A group ticket seats this many people. */
  seatsPerTicket?: number;
  /** Booking fee per ticket, on top of the price. */
  feeMinor?: bigint;
};

/** A ticket choice; `amountMinor` is the price chosen per ticket when it's pay what you want. */
export type OrderItem = { ticketTypeId: string; quantity: number; amountMinor?: number | null; };

/** Something bought alongside tickets; it takes no seat. */
export type PricedAddOn = { id: string; name: string; priceMinor: bigint; maxPerOrder: number; };
export type AddOnItem = { addOnId: string; quantity: number; };

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
  kind: "TICKET" | "ADD_ON" | "FEE";
  ticketTypeId: string | null;
  addOnId: string | null;
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
  /** People the order seats: one per ticket, or more for a group ticket. */
  seats: number;
};

/** A pricing rule refused the order; the message is safe to show. */
export class PricingError extends Error {}

export const MAX_TICKETS_PER_ORDER = 20;
export const MAX_SEATS_PER_ORDER = 100;
/** The most anyone may choose to pay for one ticket, in minor units. */
export const MAX_CHOSEN_PRICE_MINOR = 100_000_000;
const ZERO = BigInt(0);

/** Merge repeated ticket types and drop zero quantities. A chosen price must agree across repeats. */
export function normalizeItems(items: OrderItem[]): OrderItem[] {
  const merged = new Map<string, OrderItem>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 0) throw new PricingError("Choose how many tickets you want.");
    if (item.quantity === 0) continue;
    const seen = merged.get(item.ticketTypeId);
    if (seen && (seen.amountMinor ?? null) !== (item.amountMinor ?? null)) throw new PricingError("Choose one price for each ticket.");
    merged.set(item.ticketTypeId, { ...item, quantity: (seen?.quantity ?? 0) + item.quantity });
  }
  return [...merged.values()];
}

const HUNDRED = BigInt(100);

function percentOf(amount: bigint, percent: number) {
  return (amount * BigInt(percent)) / HUNDRED; // rounds down: never more than the stated discount
}

/**
 * Apply a promo code to the ticket lines. Per ticket: each discounted ticket
 * gets the percentage or fixed amount off (up to `perOrderLimit` tickets).
 * Per order: the discount comes off the eligible subtotal once, spread over
 * the eligible lines in proportion, with the remainder on the last line.
 * A discount never exceeds what it applies to; add-ons and fees are never discounted.
 */
function applyPromo(lines: PricedLine[], promo: PromoRule) {
  const eligible = lines.filter((line) => line.kind === "TICKET" && line.unitMinor > ZERO && (!promo.ticketTypeId || line.ticketTypeId === promo.ticketTypeId));
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

/** What one ticket costs: its fixed price, or the price the buyer chose within its range. */
function unitPrice(type: PricedTicketType, item: OrderItem) {
  if (type.pricing !== "FLEXIBLE") return type.priceMinor;
  const chosen = item.amountMinor ?? Number(type.priceMinor);
  if (!Number.isSafeInteger(chosen) || chosen < 0 || chosen > MAX_CHOSEN_PRICE_MINOR) throw new PricingError(`${type.name}: enter the amount you'd like to pay.`);
  const amount = BigInt(chosen);
  if (amount < type.priceMinor) throw new PricingError(`${type.name}: the least you can pay is the minimum shown.`);
  if (type.maxPriceMinor != null && amount > type.maxPriceMinor) throw new PricingError(`${type.name}: that's more than this ticket allows.`);
  return amount;
}

export function priceOrder(items: OrderItem[], types: PricedTicketType[], promo?: PromoRule | null, extras: { addOns?: AddOnItem[]; addOnTypes?: PricedAddOn[]; } = {}): PricedOrder {
  const normalized = normalizeItems(items);
  if (normalized.length === 0) throw new PricingError("Choose at least one ticket.");
  const tickets = normalized.reduce((sum, item) => sum + item.quantity, 0);
  if (tickets > MAX_TICKETS_PER_ORDER) throw new PricingError(`You can buy up to ${MAX_TICKETS_PER_ORDER} tickets at a time.`);
  let seats = 0;
  const lines: PricedLine[] = normalized.map((item) => {
    const type = types.find((candidate) => candidate.id === item.ticketTypeId);
    if (!type) throw new PricingError("That ticket is no longer available.");
    if (item.quantity < type.minPerOrder) throw new PricingError(`${type.name}: choose at least ${type.minPerOrder}.`);
    if (item.quantity > type.maxPerOrder) throw new PricingError(`${type.name}: up to ${type.maxPerOrder} per order.`);
    seats += item.quantity * (type.seatsPerTicket ?? 1);
    const unit = unitPrice(type, item);
    return { kind: "TICKET", ticketTypeId: type.id, addOnId: null, description: type.name, quantity: item.quantity, unitMinor: unit, discountMinor: ZERO, totalMinor: unit * BigInt(item.quantity) };
  });
  if (seats > MAX_SEATS_PER_ORDER) throw new PricingError(`One order can seat up to ${MAX_SEATS_PER_ORDER} people.`);
  if (promo) applyPromo(lines, promo);

  // The booking fee goes on each ticket that still costs something.
  const fees: PricedLine[] = lines.flatMap((line) => {
    const fee = types.find((type) => type.id === line.ticketTypeId)?.feeMinor ?? ZERO;
    if (fee <= ZERO || line.totalMinor <= ZERO) return [];
    return [{ kind: "FEE", ticketTypeId: line.ticketTypeId, addOnId: null, description: `${line.description}: booking fee`, quantity: line.quantity, unitMinor: fee, discountMinor: ZERO, totalMinor: fee * BigInt(line.quantity) }];
  });
  const addOns: PricedLine[] = [];
  for (const item of extras.addOns ?? []) {
    if (!Number.isInteger(item.quantity) || item.quantity < 0) throw new PricingError("Choose how many of each extra you want.");
    if (item.quantity === 0) continue;
    const addOn = extras.addOnTypes?.find((candidate) => candidate.id === item.addOnId);
    if (!addOn) throw new PricingError("That extra is no longer available.");
    if (addOns.some((line) => line.addOnId === addOn.id)) throw new PricingError("Choose each extra once.");
    if (item.quantity > addOn.maxPerOrder) throw new PricingError(`${addOn.name}: up to ${addOn.maxPerOrder} per order.`);
    addOns.push({ kind: "ADD_ON", ticketTypeId: null, addOnId: addOn.id, description: addOn.name, quantity: item.quantity, unitMinor: addOn.priceMinor, discountMinor: ZERO, totalMinor: addOn.priceMinor * BigInt(item.quantity) });
  }

  const all = [...lines, ...addOns, ...fees];
  const subtotal = all.reduce((sum, line) => sum + line.unitMinor * BigInt(line.quantity), ZERO);
  const discount = all.reduce((sum, line) => sum + line.discountMinor, ZERO);
  return { lines: all, subtotalMinor: subtotal, discountMinor: discount, totalMinor: subtotal - discount, seats };
}

/** The line names a buyer sees on the provider's page. */
export function checkoutLineName(line: { description: string; quantity: number; }) {
  return line.quantity > 1 ? `${line.description} × ${line.quantity}` : line.description;
}
