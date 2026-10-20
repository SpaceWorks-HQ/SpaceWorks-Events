import { describe, expect, it } from "vitest";
import {
  currencyExponent,
  formatMoney,
  isValidCurrency,
  MAX_AMOUNT_MINOR,
  providerMinimumMinor,
  minorToDecimalString,
  parseMinorAmount,
  parseMoneyToMinor,
} from "@/lib/payments/money";

describe("payment money helpers", () => {
  it("uses ISO 4217 exponents rather than assuming hundredths", () => {
    expect(currencyExponent("INR")).toBe(2);
    expect(currencyExponent("usd")).toBe(2);
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("KWD")).toBe(3);
  });

  it("accepts only uppercase codes Intl recognises", () => {
    expect(isValidCurrency("INR")).toBe(true);
    expect(isValidCurrency("inr")).toBe(false);
    expect(isValidCurrency("ZZZ")).toBe(false);
    expect(isValidCurrency("RUPEE")).toBe(false);
  });

  it("parses typed amounts into exact bigint minor units", () => {
    expect(parseMoneyToMinor("1,250.5", "INR")).toBe(BigInt(125050));
    expect(parseMoneyToMinor("₹ 99", "INR")).toBe(BigInt(9900));
    expect(parseMoneyToMinor("0.07", "INR")).toBe(BigInt(7));
    expect(parseMoneyToMinor("500", "JPY")).toBe(BigInt(500));
    expect(parseMoneyToMinor("1.005", "KWD")).toBe(BigInt(1005));
  });

  it("rejects negatives, extra precision, junk and amounts over the ceiling", () => {
    expect(parseMoneyToMinor("-5", "INR")).toBeNull();
    expect(parseMoneyToMinor("1.234", "INR")).toBeNull();
    expect(parseMoneyToMinor("1.5", "JPY")).toBeNull();
    expect(parseMoneyToMinor("12abc", "INR")).toBeNull();
    expect(parseMoneyToMinor("", "INR")).toBeNull();
    expect(parseMoneyToMinor("10000000001", "INR")).toBeNull();
    expect(parseMoneyToMinor("10000000000", "INR")).toBe(MAX_AMOUNT_MINOR);
  });

  it("never rounds through floats when formatting", () => {
    expect(minorToDecimalString(BigInt(125050), "INR")).toBe("1250.50");
    expect(minorToDecimalString(7, "INR")).toBe("0.07");
    expect(minorToDecimalString(BigInt(1005), "KWD")).toBe("1.005");
    expect(minorToDecimalString(BigInt(500), "JPY")).toBe("500");
    expect(minorToDecimalString(BigInt(-1999), "USD")).toBe("-19.99");
    expect(minorToDecimalString(BigInt("900719925474099312"), "INR")).toBe("9007199254740993.12");
    expect(() => minorToDecimalString(1.5, "INR")).toThrow(RangeError);
  });

  it("formats with the currency symbol", () => {
    expect(formatMoney(BigInt(125050), "INR")).toBe("₹1,250.50");
    expect(formatMoney(BigInt(500), "JPY", "en-US")).toBe("¥500");
  });

  it("accepts provider amounts only as safe non-negative integers", () => {
    expect(parseMinorAmount(49900)).toBe(BigInt(49900));
    expect(parseMinorAmount("49900")).toBe(BigInt(49900));
    expect(parseMinorAmount(499.5)).toBeNull();
    expect(parseMinorAmount(-1)).toBeNull();
    expect(parseMinorAmount("1e5")).toBeNull();
    expect(parseMinorAmount(null)).toBeNull();
  });

  it("knows each provider's smallest charge", () => {
    expect(providerMinimumMinor("RAZORPAY", "INR")).toBe(BigInt(100));
    expect(providerMinimumMinor("STRIPE", "INR")).toBe(BigInt(50));
    expect(providerMinimumMinor("STRIPE", "GBP")).toBe(BigInt(30));
    expect(providerMinimumMinor("STRIPE", "KWD")).toBe(BigInt(500));
  });
});
