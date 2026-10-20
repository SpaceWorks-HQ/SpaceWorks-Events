import { describe, expect, it } from "vitest";
import { priceOrder, PricingError, type PricedTicketType, type PromoRule } from "@/lib/payments/pricing";

const n = (value: number) => BigInt(value);
const ticket = (overrides: Partial<PricedTicketType> = {}): PricedTicketType => ({ id: "t1", name: "General", priceMinor: n(50000), minPerOrder: 1, maxPerOrder: 10, ...overrides });
const half: PromoRule = { kind: "PERCENT", appliesPer: "TICKET", percentOff: 50, amountOffMinor: null, ticketTypeId: null, minQuantity: 1, perOrderLimit: null };

describe("pricing extras", () => {
  it("prices pay-what-you-want tickets at the chosen amount, within their range", () => {
    const flexible = ticket({ pricing: "FLEXIBLE", priceMinor: n(10000), maxPriceMinor: n(100000) });
    expect(priceOrder([{ ticketTypeId: "t1", quantity: 2, amountMinor: 25000 }], [flexible]).totalMinor).toBe(n(50000));
    // No amount given: the minimum.
    expect(priceOrder([{ ticketTypeId: "t1", quantity: 1 }], [flexible]).totalMinor).toBe(n(10000));
    expect(() => priceOrder([{ ticketTypeId: "t1", quantity: 1, amountMinor: 5000 }], [flexible])).toThrow(/least you can pay/);
    expect(() => priceOrder([{ ticketTypeId: "t1", quantity: 1, amountMinor: 200000 }], [flexible])).toThrow(/more than this ticket allows/);
    expect(() => priceOrder([{ ticketTypeId: "t1", quantity: 1, amountMinor: Number.NaN }], [flexible])).toThrow(PricingError);
    // A fixed price ignores any amount sent.
    expect(priceOrder([{ ticketTypeId: "t1", quantity: 1, amountMinor: 1 }], [ticket()]).totalMinor).toBe(n(50000));
    expect(() => priceOrder([{ ticketTypeId: "t1", quantity: 1, amountMinor: 20000 }, { ticketTypeId: "t1", quantity: 1, amountMinor: 30000 }], [flexible])).toThrow(/one price/);
  });

  it("seats several people per group ticket", () => {
    const group = ticket({ seatsPerTicket: 4 });
    expect(priceOrder([{ ticketTypeId: "t1", quantity: 2 }], [group])).toMatchObject({ seats: 8, totalMinor: n(100000) });
    expect(() => priceOrder([{ ticketTypeId: "t1", quantity: 6 }], [ticket({ seatsPerTicket: 20 })])).toThrow(/up to 100 people/);
  });

  it("adds a booking fee per paid ticket, never discounted, and none on a ticket made free", () => {
    const fee = ticket({ feeMinor: n(2000) });
    const order = priceOrder([{ ticketTypeId: "t1", quantity: 2 }], [fee], half);
    expect(order.lines.map((line) => [line.kind, line.totalMinor])).toEqual([["TICKET", n(50000)], ["FEE", n(4000)]]);
    expect(order.totalMinor).toBe(n(54000));
    const free = priceOrder([{ ticketTypeId: "t1", quantity: 1 }], [fee], { ...half, percentOff: 100 });
    expect(free.totalMinor).toBe(n(0));
  });

  it("adds extras at their price, without discount, within their per-order limit", () => {
    const addOnTypes = [{ id: "a1", name: "T-shirt", priceMinor: n(30000), maxPerOrder: 2 }];
    const order = priceOrder([{ ticketTypeId: "t1", quantity: 1 }], [ticket()], half, { addOns: [{ addOnId: "a1", quantity: 2 }], addOnTypes });
    expect(order.lines.map((line) => [line.kind, line.addOnId, line.totalMinor])).toEqual([["TICKET", null, n(25000)], ["ADD_ON", "a1", n(60000)]]);
    expect(order.totalMinor).toBe(n(85000));
    expect(order.seats).toBe(1);
    expect(() => priceOrder([{ ticketTypeId: "t1", quantity: 1 }], [ticket()], null, { addOns: [{ addOnId: "a1", quantity: 3 }], addOnTypes })).toThrow(/up to 2/);
    expect(() => priceOrder([{ ticketTypeId: "t1", quantity: 1 }], [ticket()], null, { addOns: [{ addOnId: "zz", quantity: 1 }], addOnTypes })).toThrow(/no longer available/);
    // Extras alone are not an order.
    expect(() => priceOrder([], [ticket()], null, { addOns: [{ addOnId: "a1", quantity: 1 }], addOnTypes })).toThrow(/at least one ticket/);
  });
});
