import { describe, expect, it } from "vitest";
import { generateShortCode, isShortCodeShape, SHORT_CODE_LENGTH, shortLinkPath } from "@/lib/shortLink";
import { createOrganisationSchema } from "@/lib/validators";

describe("short link codes", () => {
  it("are 7 alphanumeric characters with at least one uppercase letter", () => {
    for (let i = 0; i < 5000; i++) {
      const code = generateShortCode();
      expect(code).toHaveLength(SHORT_CODE_LENGTH);
      expect(code).toMatch(/^[A-Za-z0-9]{7}$/);
      expect(code).toMatch(/[A-Z]/);
      expect(isShortCodeShape(code)).toBe(true);
    }
  });

  it("are not predictable from one another", () => {
    const codes = new Set(Array.from({ length: 5000 }, generateShortCode));
    expect(codes.size).toBe(5000);
  });

  it("can never be a valid organisation slug", () => {
    for (let i = 0; i < 2000; i++) {
      expect(createOrganisationSchema.shape.slug.safeParse(generateShortCode()).success).toBe(false);
    }
  });

  it("recognise only the exact code shape", () => {
    expect(isShortCodeShape("aB3x9Kq")).toBe(true);
    expect(isShortCodeShape("ABCDEFG")).toBe(true);
    expect(isShortCodeShape("abc1234")).toBe(false); // lowercase: an organisation slug
    expect(isShortCodeShape("aB3x9K")).toBe(false);
    expect(isShortCodeShape("aB3x9Kqq")).toBe(false);
    expect(isShortCodeShape("aB3-9Kq")).toBe(false);
    expect(isShortCodeShape("")).toBe(false);
  });

  it("are served at the site root", () => {
    expect(shortLinkPath("aB3x9Kq")).toBe("/aB3x9Kq");
  });
});
