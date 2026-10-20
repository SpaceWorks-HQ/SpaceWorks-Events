import { describe, expect, it } from "vitest";
import { describePaymentMethod } from "@/lib/payments/paymentMethod";

describe("payment method summaries for receipts", () => {
  it("shows a card's brand and last four digits only", () => {
    expect(describePaymentMethod({ type: "card", brand: "Visa", last4: "4242" })).toEqual({ type: "card", summary: "Visa •••• 4242" });
    expect(describePaymentMethod({ type: "card", brand: "mastercard", last4: "0005" })).toEqual({ type: "card", summary: "Mastercard •••• 0005" });
    expect(describePaymentMethod({ type: "card", brand: "Visa", last4: "4242424242424242" })).toEqual({ type: "card", summary: "Card" });
  });

  it("keeps only the bank handle of a UPI id", () => {
    expect(describePaymentMethod({ type: "upi", vpa: "someone.name@okicici" })).toEqual({ type: "upi", summary: "UPI ••••@okicici" });
    expect(describePaymentMethod({ type: "upi" })).toEqual({ type: "upi", summary: "UPI" });
  });

  it("names the bank or wallet, and anything else by its type", () => {
    expect(describePaymentMethod({ type: "netbanking", bank: "HDFC" })).toEqual({ type: "netbanking", summary: "Net banking · HDFC" });
    expect(describePaymentMethod({ type: "wallet", wallet: "paytm" })).toEqual({ type: "wallet", summary: "Wallet · paytm" });
    expect(describePaymentMethod({ type: "amazon_pay" })).toEqual({ type: "amazon_pay", summary: "Amazon Pay" });
  });

  it("ignores what it can't trust", () => {
    expect(describePaymentMethod({ type: "Card<script>" })).toBeNull();
    expect(describePaymentMethod({ type: null })).toBeNull();
    expect(describePaymentMethod({ type: "netbanking", bank: "<b>HDFC</b>" })?.summary).toBe("Net banking · bHDFCb");
  });
});
