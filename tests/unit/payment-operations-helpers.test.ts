import { describe, expect, it } from "vitest";
import { priceOrder, type PromoRule } from "@/lib/payments/pricing";
import { isValidPromoCode, normalizePromoCode, promoCodeDigest, promoCodeHint } from "@/lib/payments/promo";
import { asRefundPolicy, describeRefundPolicy, isAtLeastAsGenerous, policyRefundMinor, type RefundPolicySnapshot } from "@/lib/payments/refundPolicy";
import { effectiveOfflineRecord } from "@/lib/payments/offlineRecord";

const B = (value: number) => BigInt(value);
const types = [
  { id: "a", name: "General", priceMinor: B(50000), minPerOrder: 1, maxPerOrder: 10 },
  { id: "b", name: "VIP", priceMinor: B(120000), minPerOrder: 1, maxPerOrder: 10 },
  { id: "f", name: "Free", priceMinor: B(0), minPerOrder: 1, maxPerOrder: 10 },
];
const rule = (overrides: Partial<PromoRule>): PromoRule => ({ kind: "PERCENT", appliesPer: "TICKET", percentOff: 10, amountOffMinor: null, ticketTypeId: null, minQuantity: 1, perOrderLimit: null, ...overrides });

describe("promo pricing", () => {
  it("takes a percentage off each ticket, rounding down", () => {
    const priced = priceOrder([{ ticketTypeId: "a", quantity: 3 }], [{ ...types[0]!, priceMinor: B(33333) }], rule({ percentOff: 10 }));
    expect(priced.lines[0]).toMatchObject({ discountMinor: B(9999), totalMinor: B(90000) });
    expect(priced).toMatchObject({ subtotalMinor: B(99999), discountMinor: B(9999), totalMinor: B(90000) });
  });

  it("caps a fixed discount at each ticket's price and limits how many tickets get it", () => {
    const priced = priceOrder([{ ticketTypeId: "a", quantity: 3 }], types, rule({ kind: "FIXED", percentOff: null, amountOffMinor: B(80000), perOrderLimit: 2 }));
    expect(priced.lines[0]).toMatchObject({ discountMinor: B(100000), totalMinor: B(50000) });
  });

  it("spreads an order discount over eligible lines in proportion, never past their value", () => {
    const priced = priceOrder([{ ticketTypeId: "a", quantity: 1 }, { ticketTypeId: "b", quantity: 1 }], types, rule({ kind: "FIXED", appliesPer: "ORDER", percentOff: null, amountOffMinor: B(17000) }));
    expect(priced.lines.map((line) => line.discountMinor)).toEqual([B(5000), B(12000)]);
    expect(priced.totalMinor).toBe(B(153000));
    const all = priceOrder([{ ticketTypeId: "a", quantity: 1 }], types, rule({ kind: "FIXED", appliesPer: "ORDER", percentOff: null, amountOffMinor: B(999999) }));
    expect(all.totalMinor).toBe(B(0));
  });

  it("applies only to its ticket, and needs the minimum quantity", () => {
    const vipOnly = priceOrder([{ ticketTypeId: "a", quantity: 1 }, { ticketTypeId: "b", quantity: 1 }], types, rule({ ticketTypeId: "b", percentOff: 50 }));
    expect(vipOnly.lines.map((line) => line.discountMinor)).toEqual([B(0), B(60000)]);
    expect(() => priceOrder([{ ticketTypeId: "a", quantity: 1 }], types, rule({ ticketTypeId: "b" }))).toThrow("That promo code doesn't apply to these tickets.");
    expect(() => priceOrder([{ ticketTypeId: "a", quantity: 2 }], types, rule({ minQuantity: 3 }))).toThrow("That promo code needs at least 3 eligible tickets.");
    expect(() => priceOrder([{ ticketTypeId: "f", quantity: 1 }], types, rule({}))).toThrow("That promo code doesn't apply to these tickets.");
  });

  it("stores codes only as a digest of the normalised code", () => {
    expect(normalizePromoCode(" early bird ")).toBe("EARLYBIRD");
    expect(promoCodeDigest("earlybird")).toBe(promoCodeDigest("EARLY BIRD"));
    expect(promoCodeDigest("x")).toMatch(/^[a-f0-9]{64}$/);
    expect(promoCodeHint("summer-25")).toBe("SUM…");
    expect(isValidPromoCode("ab")).toBe(false);
    expect(isValidPromoCode("SAVE-10_OK")).toBe(true);
    expect(isValidPromoCode("no!")).toBe(false);
  });
});

describe("refund policy", () => {
  const start = new Date("2035-01-10T10:00:00.000Z");
  const full48: RefundPolicySnapshot = { kind: "FULL_UNTIL", hours: 48, percent: null, text: "" };
  const half24: RefundPolicySnapshot = { kind: "PERCENT_UNTIL", hours: 24, percent: 50, text: "" };
  const none: RefundPolicySnapshot = { kind: "NONE", hours: null, percent: null, text: "" };

  it("refunds by the policy until its deadline, and nothing after", () => {
    expect(policyRefundMinor(full48, B(50000), start, new Date("2035-01-08T09:59:00.000Z"))).toBe(B(50000));
    expect(policyRefundMinor(full48, B(50000), start, new Date("2035-01-08T10:01:00.000Z"))).toBeNull();
    expect(policyRefundMinor(half24, B(50001), start, new Date("2035-01-09T09:00:00.000Z"))).toBe(B(25000));
    expect(policyRefundMinor(none, B(50000), start, new Date("2035-01-01T00:00:00.000Z"))).toBeNull();
    expect(policyRefundMinor(null, B(50000), start)).toBeNull();
  });

  it("after a sale, allows only changes that refund at least as much at every moment", () => {
    expect(isAtLeastAsGenerous(full48, none)).toBe(true);
    expect(isAtLeastAsGenerous(none, half24)).toBe(false);
    expect(isAtLeastAsGenerous({ ...full48, hours: 24 }, full48)).toBe(true);
    expect(isAtLeastAsGenerous({ ...full48, hours: 72 }, full48)).toBe(false);
    expect(isAtLeastAsGenerous(half24, full48)).toBe(false);
    expect(isAtLeastAsGenerous({ ...half24, percent: 75 }, half24)).toBe(true);
    expect(isAtLeastAsGenerous({ ...half24, percent: 25 }, half24)).toBe(false);
    expect(isAtLeastAsGenerous({ ...full48, hours: 12 }, half24)).toBe(true);
  });

  it("reads a stored snapshot and describes it for buyers", () => {
    expect(asRefundPolicy({ kind: "FULL_UNTIL", hours: 48, percent: null, text: "x" })).toEqual({ kind: "FULL_UNTIL", hours: 48, percent: null, text: "x" });
    expect(asRefundPolicy({ kind: "SOMETIMES" })).toBeNull();
    expect(asRefundPolicy(null)).toBeNull();
    expect(describeRefundPolicy(full48)).toBe("Full refund if you cancel until 2 days before the event.");
    expect(describeRefundPolicy({ ...half24, hours: 0 })).toBe("50% refund if you cancel until the event starts.");
    expect(describeRefundPolicy(none)).toMatch(/^No refunds/);
  });
});

describe("offline payment record", () => {
  it("applies amendments in order, the latest of each field winning", () => {
    expect(effectiveOfflineRecord({
      offlineMethod: "CASH",
      offlineReference: null,
      amendments: [
        { field: "offlineMethod", newValue: "UPI" },
        { field: "offlineReference", newValue: "UTR123" },
        { field: "offlineMethod", newValue: "BANK_TRANSFER" },
      ],
    })).toEqual({ method: "BANK_TRANSFER", reference: "UTR123" });
  });
});
