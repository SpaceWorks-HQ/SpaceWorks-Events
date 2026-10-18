import { describe, expect, it } from "vitest";
import {
  isValidInternationalPhone,
  normalizeInternationalPhone,
  phoneValidationMessage,
} from "@/lib/phone";
import { phoneNumberInputValue } from "@/components/rsvp/QuestionField";

describe("international phone validation", () => {
  it("accepts valid Indian mobile numbers", () => {
    const phone = normalizeInternationalPhone("+91 98765-43210");
    expect(phone).toBe("+919876543210");
    expect(isValidInternationalPhone(phone)).toBe(true);
  });

  it("rejects Indian numbers with an invalid prefix or length", () => {
    expect(isValidInternationalPhone("+915876543210")).toBe(false);
    expect(isValidInternationalPhone("+91987654321")).toBe(false);
    expect(phoneValidationMessage("Phone", "+915876543210")).toBe(
      "Phone must be a valid 10-digit Indian mobile number.",
    );
  });

  it("keeps standard E.164 validation for other countries", () => {
    expect(isValidInternationalPhone("+14155552671")).toBe(true);
    expect(isValidInternationalPhone("+1415555")).toBe(false);
  });
});

describe("registration phone input", () => {
  it("keeps every digit of a pasted number with spaces or a country code", () => {
    expect(phoneNumberInputValue("", "+91 98765 43210")).toBe("+919876543210");
    expect(phoneNumberInputValue("", "98765 43210")).toBe("+919876543210");
    expect(phoneNumberInputValue("", "0044 20 7946 0958")).toBe("+442079460958");
  });

  it("caps national digits for the chosen country", () => {
    expect(phoneNumberInputValue("+91", "987654321099")).toBe("+919876543210");
    expect(phoneNumberInputValue("+44", "2079460958")).toBe("+442079460958");
  });
});
