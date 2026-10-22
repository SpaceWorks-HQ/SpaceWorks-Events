import { describe, expect, it } from "vitest";
import { hasRevenue, summariseRevenue, type RevenueOrder } from "@/lib/payments/revenueMetrics";

const now = new Date("2030-03-10T12:00:00Z");
const b = (value: number) => BigInt(value);
type Payment = RevenueOrder["payments"][number];

function payment(overrides: Partial<Payment> = {}): Payment {
  return { status: "PAID_ONLINE", provider: "RAZORPAY", amountMinor: b(100000), testMode: false, paidAt: new Date("2030-03-09T10:00:00Z"), offlineMethod: null, refunds: [], disputes: [], ...overrides };
}

function order(overrides: Partial<RevenueOrder> = {}): RevenueOrder {
  return {
    id: Math.random().toString(36).slice(2),
    status: "CONFIRMED",
    currency: "INR",
    totalMinor: b(100000),
    discountMinor: b(0),
    holdExpiresAt: null,
    createdAt: new Date("2030-03-09T09:00:00Z"),
    lines: [{ kind: "TICKET", ticketTypeId: "general", description: "General", quantity: 2, totalMinor: b(100000) }],
    payments: [payment()],
    ...overrides,
  };
}

describe("summariseRevenue", () => {
  it("collects paid orders and subtracts refunds, settled or on their way", () => {
    const summary = summariseRevenue([
      order(),
      order({ payments: [payment({ refunds: [{ amountMinor: b(30000), status: "SUCCEEDED", automatic: false }] })] }),
      order({ payments: [payment({ refunds: [{ amountMinor: b(20000), status: "PENDING", automatic: false }, { amountMinor: b(50000), status: "FAILED", automatic: false }] })] }),
    ], { now, timeZone: "Asia/Kolkata" });
    expect(summary.collectedMinor).toBe(300000);
    expect(summary.refundedMinor).toBe(30000);
    expect(summary.refundPendingMinor).toBe(20000);
    expect(summary.netMinor).toBe(250000);
    expect(summary.orders.paid).toBe(3);
    expect(summary.byTicket).toEqual([{ name: "General", tickets: 6, revenueMinor: 300000 }]);
    expect(summary.byMethod).toEqual([{ label: "Razorpay", payments: 3, amountMinor: 300000 }]);
    expect(summary.testOnly).toBe(false);
  });

  it("splits fees, extras and discounts out of the ticket takings", () => {
    const summary = summariseRevenue([order({
      totalMinor: b(118000),
      discountMinor: b(10000),
      lines: [
        { kind: "TICKET", ticketTypeId: "vip", description: "VIP", quantity: 1, totalMinor: b(100000) },
        { kind: "ADD_ON", ticketTypeId: null, description: "T-shirt", quantity: 1, totalMinor: b(15000) },
        { kind: "FEE", ticketTypeId: null, description: "Booking fee", quantity: 1, totalMinor: b(3000) },
      ],
      payments: [payment({ amountMinor: b(118000) })],
    })], { now, timeZone: "UTC" });
    expect(summary).toMatchObject({ feesMinor: 3000, addOnsMinor: 15000, discountMinor: 10000 });
    expect(summary.byTicket).toEqual([{ name: "VIP", tickets: 1, revenueMinor: 100000 }]);
  });

  it("keeps late or duplicate payments returned automatically out of paid orders", () => {
    const summary = summariseRevenue([order({
      status: "EXPIRED",
      payments: [payment({ refunds: [{ amountMinor: b(100000), status: "SUCCEEDED", automatic: true }] })],
    })], { now, timeZone: "UTC" });
    expect(summary.orders.paid).toBe(0);
    expect(summary.automaticRefundMinor).toBe(100000);
    expect(summary.netMinor).toBe(0);
    expect(summary.byTicket).toEqual([]);
  });

  it("counts desk, complimentary, held and requested orders without calling them collected", () => {
    const summary = summariseRevenue([
      order({ payments: [payment({ status: "PENDING", provider: "OFFLINE", paidAt: null })] }),
      order({ payments: [payment({ status: "WAIVED", provider: "OFFLINE", paidAt: null })] }),
      order({ status: "PENDING", holdExpiresAt: new Date("2030-03-10T12:10:00Z"), payments: [payment({ status: "PENDING", paidAt: null })] }),
      order({ status: "PENDING", holdExpiresAt: new Date("2030-03-10T11:00:00Z"), payments: [] }),
      order({ status: "REQUESTED", payments: [] }),
    ], { now, timeZone: "UTC" });
    expect(summary.collectedMinor).toBe(0);
    expect(summary.orders).toMatchObject({ paid: 0, atDesk: 1, complimentary: 1, awaiting: 1, requested: 1 });
    expect(summary).toMatchObject({ owedAtDeskMinor: 100000, complimentaryValueMinor: 100000, heldMinor: 100000 });
    expect(hasRevenue(summary)).toBe(true);
  });

  it("labels in-person methods, tracks chargebacks and flags test-only money", () => {
    const summary = summariseRevenue([
      order({ payments: [payment({ provider: "OFFLINE", status: "PAID_OFFLINE", offlineMethod: "CASH", testMode: true })] }),
      order({ payments: [payment({ provider: "STRIPE", testMode: true, disputes: [{ status: "OPEN", amountMinor: b(100000) }] })] }),
      order({ payments: [payment({ testMode: true, disputes: [{ status: "LOST", amountMinor: b(40000) }, { status: "WON", amountMinor: b(1) }] })] }),
    ], { now, timeZone: "UTC" });
    expect(summary.byMethod.map((row) => row.label).sort()).toEqual(["Cash", "Razorpay", "Stripe"]);
    expect(summary.disputes).toEqual({ open: 1, openMinor: 100000, lost: 1, lostMinor: 40000 });
    expect(summary.testOnly).toBe(true);
  });

  it("buckets collected money by day in the event's time zone", () => {
    const summary = summariseRevenue([
      order({ payments: [payment({ paidAt: new Date("2030-03-09T20:00:00Z") })] }),
      order({ payments: [payment({ paidAt: new Date("2030-03-10T02:00:00Z") })] }),
    ], { now, timeZone: "Asia/Kolkata", days: 3 });
    // 20:00 UTC on the 9th is already the 10th in India.
    expect(summary.daily.columns).toEqual([
      { label: "8 Mar", count: 0 },
      { label: "9 Mar", count: 0 },
      { label: "10 Mar", count: 200000 },
    ]);
    expect(summary.daily.largest).toBe(200000);
  });

  it("reports nothing to show for an empty or fully cancelled set", () => {
    const summary = summariseRevenue([order({ status: "CANCELLED", payments: [] })], { now, timeZone: "UTC" });
    expect(summary.orders.cancelled).toBe(1);
    expect(hasRevenue(summary)).toBe(false);
  });
});
