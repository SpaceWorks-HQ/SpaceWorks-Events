import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/theme/accent";
import { attendeePhotoUrl, managedImageKey, managedImageUrl } from "@/lib/badge/imageUrl";
import {
  BADGE_ACCENT_KEYS,
  BADGE_BACKGROUND_KEYS,
  BADGE_TEXT_KEYS,
  BRAND,
  isReadableText,
  resolveBadgePalette,
} from "@/lib/badge/palette";
import { A4, cropMarks, pixelSize, sheetLayout, sheetSlot } from "@/lib/badge/sheet";
import { attendeeInitials } from "@/lib/badge/types";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("badge colour palette", () => {
  it("keeps every text colour at 4.5:1 or better on every brand background and accent", () => {
    for (const eventAccent of [null, "#FF7447", "#DFFF8F", "#4B3FA8", "#FFFFFF", "#808080", "#C2410C", "not a colour"]) {
      for (const backgroundColor of BADGE_BACKGROUND_KEYS) {
        for (const accentColor of BADGE_ACCENT_KEYS) {
          for (const textColor of BADGE_TEXT_KEYS) {
            const palette = resolveBadgePalette({ colorMode: "colour", backgroundColor, accentColor, textColor }, eventAccent);
            const context = `${backgroundColor}/${accentColor}/${textColor}/${eventAccent}`;
            expect(contrastRatio(palette.text, palette.background), `text ${context}`).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(palette.heading, palette.background), `heading ${context}`).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(palette.onAccent, palette.accent), `band text ${context}`).toBeGreaterThanOrEqual(4.5);
            expect(palette.text, `orange text ${context}`).not.toBe(BRAND.orange);
            expect(palette.heading, `orange heading ${context}`).not.toBe(BRAND.orange);
            expect(palette.onAccent).not.toBe(BRAND.orange);
          }
        }
      }
    }
  });

  it("replaces a chosen text colour that would be unreadable, and says so", () => {
    const palette = resolveBadgePalette({ colorMode: "colour", backgroundColor: "ink", accentColor: "teal", textColor: "ink" }, null);
    expect(palette.textAdjusted).toBe(true);
    expect(palette.text).toBe(BRAND.cream);
    const fine = resolveBadgePalette({ colorMode: "colour", backgroundColor: "cream", accentColor: "teal", textColor: "teal" }, null);
    expect(fine).toMatchObject({ text: BRAND.teal, textAdjusted: false });
  });

  it("uses Workshop Orange only as a fill, with ink on it", () => {
    const palette = resolveBadgePalette({ colorMode: "colour", backgroundColor: "white", accentColor: "orange", textColor: "auto" }, null);
    expect(palette.accent).toBe(BRAND.orange);
    expect(palette.onAccent).toBe(BRAND.ink);
    expect(palette.heading).toBe(BRAND.ink);
    expect(isReadableText(BRAND.orange, BRAND.ink)).toBe(false);
  });

  it("follows the event accent, falling back to Maker Teal", () => {
    expect(resolveBadgePalette({ colorMode: "colour", backgroundColor: "white", accentColor: "event", textColor: "auto" }, "#4b3fa8").accent).toBe("#4B3FA8");
    expect(resolveBadgePalette({ colorMode: "colour", backgroundColor: "white", accentColor: "event", textColor: "auto" }, null).accent).toBe(BRAND.teal);
  });

  it("picks the Space Works symbol master by background", () => {
    const symbol = (backgroundColor: (typeof BADGE_BACKGROUND_KEYS)[number]) => resolveBadgePalette({ colorMode: "colour", backgroundColor, accentColor: "teal", textColor: "auto" }, null).symbol;
    expect(symbol("white")).toBe("ink");
    expect(symbol("cream")).toBe("full");
    expect(symbol("citron")).toBe("full");
    expect(symbol("ink")).toBe("reversed");
    expect(symbol("teal")).toBe("reversed");
  });

  it("prints black on white in print-economy mode", () => {
    const palette = resolveBadgePalette({ colorMode: "mono", backgroundColor: "ink", accentColor: "orange", textColor: "cream" }, "#FF7447");
    expect(palette).toMatchObject({ background: "#FFFFFF", text: "#000000", accent: "#000000", onAccent: "#FFFFFF", symbol: "ink" });
  });
});

describe("badge sheet maths", () => {
  it("fits CR80 cards 2 × 5 on A4 portrait with room for crop marks", () => {
    const layout = sheetLayout(85.6, 53.98);
    expect(layout).toMatchObject({ columns: 2, rows: 5, perSheet: 10 });
    expect(layout.originXMm).toBeCloseTo((210 - 2 * 85.6) / 2, 5);
    expect(layout.originYMm).toBeCloseTo((297 - 5 * 53.98) / 2, 5);
    expect(layout.originXMm).toBeGreaterThanOrEqual(10);
    expect(layout.originYMm).toBeGreaterThanOrEqual(10);
  });

  it("places cards row by row and starts a new sheet after the last slot", () => {
    const layout = sheetLayout(85.6, 53.98);
    expect(sheetSlot(layout, 0)).toMatchObject({ sheet: 0, xMm: layout.originXMm, yMm: layout.originYMm });
    expect(sheetSlot(layout, 1)).toMatchObject({ sheet: 0, xMm: layout.originXMm + 85.6 });
    expect(sheetSlot(layout, 2).yMm).toBeCloseTo(layout.originYMm + 53.98, 5);
    expect(sheetSlot(layout, 10)).toMatchObject({ sheet: 1, xMm: layout.originXMm, yMm: layout.originYMm });
  });

  it("never returns an empty grid for oversized stock", () => {
    expect(sheetLayout(105, 148)).toMatchObject({ columns: 1, rows: 1, perSheet: 1 });
    expect(sheetLayout(300, 300, A4)).toMatchObject({ perSheet: 1, originXMm: 0, originYMm: 0 });
  });

  it("draws crop marks for every cut line, outside the cards", () => {
    const layout = sheetLayout(85.6, 53.98);
    const marks = cropMarks(layout);
    expect(marks).toHaveLength((layout.columns + 1) * 2 + (layout.rows + 1) * 2);
    const right = layout.originXMm + layout.columns * layout.cardWidthMm;
    const bottom = layout.originYMm + layout.rows * layout.cardHeightMm;
    for (const mark of marks) {
      const inside = (x: number, y: number) => x > layout.originXMm && x < right && y > layout.originYMm && y < bottom;
      expect(inside(mark.x1, mark.y1) || inside(mark.x2, mark.y2)).toBe(false);
    }
  });

  it("sizes PNGs at 300 dpi", () => {
    expect(pixelSize(85.6, 53.98)).toEqual({ width: 1011, height: 638 });
    expect(pixelSize(105, 148)).toEqual({ width: 1240, height: 1748 });
  });
});

describe("badge image URL validation", () => {
  const orgLogo = `/api/uploads/organisations/org_1/organisation-logos/${UUID}.webp`;

  it("accepts only managed WebP upload keys", () => {
    expect(managedImageKey(orgLogo)).toBe(`organisations/org_1/organisation-logos/${UUID}.webp`);
    expect(managedImageUrl(`https://events.example.test${orgLogo}?v=2`)).toBe(orgLogo);
    for (const value of [
      "https://evil.example/logo.png",
      "http://169.254.169.254/latest/meta-data",
      "//evil.example/api/uploads/x.webp",
      "/api/uploads/../secrets.webp",
      `/api/uploads/organisations/org_1/certificate-backgrounds/${UUID}.webp`,
      `/api/uploads/organisations/org_1/organisation-logos/${UUID}.png`,
      `/api/uploads/organisations/org_1/organisation-logos/not-a-uuid.webp`,
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
      "",
      null,
    ]) {
      expect(managedImageKey(value), String(value)).toBeNull();
    }
  });

  it("checks that artwork belongs to the organisation and photos to the attendee", () => {
    expect(managedImageUrl(orgLogo, { kind: "organisation", organisationId: "org_1", category: "organisation-logos" })).toBe(orgLogo);
    expect(managedImageUrl(orgLogo, { kind: "organisation", organisationId: "org_2", category: "organisation-logos" })).toBeNull();
    expect(managedImageUrl(orgLogo, { kind: "organisation", organisationId: "org_1", category: "event-sponsors" })).toBeNull();
    const photo = `/api/uploads/users/user_1/profile-images/${UUID}.webp`;
    expect(attendeePhotoUrl({ id: "user_1", profileImageUrl: photo, image: null })).toBe(photo);
    expect(attendeePhotoUrl({ id: "user_2", profileImageUrl: photo, image: null })).toBeNull();
    // Provider avatars are remote and never drawn.
    expect(attendeePhotoUrl({ id: "user_1", profileImageUrl: null, image: "https://lh3.googleusercontent.com/a/abc" })).toBeNull();
    expect(attendeePhotoUrl(null)).toBeNull();
  });

  it("makes initials for the photo placeholder", () => {
    expect(attendeeInitials("Priya Raman")).toBe("PR");
    expect(attendeeInitials("Zoë")).toBe("Z");
    expect(attendeeInitials("  ")).toBe("?");
    expect(attendeeInitials("Anne-Marie de la Cruz")).toBe("AC");
  });
});
