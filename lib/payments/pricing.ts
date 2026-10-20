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

export function priceOrder(items: OrderItem[], types: PricedTicketType[]): PricedOrder {
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
  const subtotal = lines.reduce((sum, line) => sum + line.unitMinor * BigInt(line.quantity), ZERO);
  const discount = lines.reduce((sum, line) => sum + line.discountMinor, ZERO);
  return { lines, subtotalMinor: subtotal, discountMinor: discount, totalMinor: subtotal - discount, seats };
}

/** The line names a buyer sees on the provider's page. */
export function checkoutLineName(line: { description: string; quantity: number; }) {
  return line.quantity > 1 ? `${line.description} × ${line.quantity}` : line.description;
}
