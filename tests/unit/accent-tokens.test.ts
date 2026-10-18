import { describe, expect, it } from "vitest";
import { ACCENT_PRESETS, accentStyle, contrastRatio, DEFAULT_EVENT_ACCENT, getAccentTokens, normalizeAccentHex } from "@/lib/theme/accent";

describe("accent normalisation", () => {
  it("accepts 6- and 3-digit hex and rejects anything that could inject CSS", () => {
    expect(normalizeAccentHex("#c2410c")).toBe("#C2410C");
    expect(normalizeAccentHex(" #abc ")).toBe("#AABBCC");
    expect(normalizeAccentHex("red")).toBe(DEFAULT_EVENT_ACCENT);
    expect(normalizeAccentHex("#C2410C; background: url(x)")).toBe(DEFAULT_EVENT_ACCENT);
    expect(normalizeAccentHex(null)).toBe(DEFAULT_EVENT_ACCENT);
    expect(normalizeAccentHex(undefined, "#18181B")).toBe("#18181B");
  });
});

describe("accent tokens", () => {
  it("matches the design's Ember values", () => {
    expect(getAccentTokens("#C2410C", "light")).toEqual({
      "--yy-accent": "#C2410C",
      "--yy-accent-soft": "#FAF0EC",
      "--yy-on-accent": "#FFFFFF",
      "--yy-accent-text": "#C2410C",
    });
    expect(getAccentTokens("#C2410C", "dark")["--yy-accent-soft"]).toBe("#2A1812");
  });

  it.each(["#C2410C", "#4B3FA8", "#0F766E", "#18181B", "#FDE047", "#A7F3D0", "#FFFFFF", "#000000", "#EC4899"])(
    "keeps every derived pairing readable for %s",
    (accent) => {
      for (const scheme of ["light", "dark"] as const) {
        const tokens = getAccentTokens(accent, scheme);
        const canvas = scheme === "dark" ? "#111113" : "#FFFFFF";
        expect(contrastRatio(tokens["--yy-on-accent"], tokens["--yy-accent"])).toBeGreaterThanOrEqual(scheme === "light" && contrastRatio(accent, "#FFFFFF") < 4.5 ? 1 : 4.5);
        expect(contrastRatio(tokens["--yy-accent-text"], canvas)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(tokens["--yy-accent-text"], tokens["--yy-accent-soft"])).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("never puts white text on a light accent", () => {
    expect(getAccentTokens("#FDE047", "light")["--yy-on-accent"]).toBe("#18181B");
    for (const preset of ACCENT_PRESETS) {
      const onAccent = getAccentTokens(preset.hex, "light")["--yy-on-accent"];
      expect(contrastRatio(onAccent, preset.hex)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("exposes light and dark values for the page root", () => {
    const style = accentStyle("#4B3FA8");
    expect(style["--yy-accent-light"]).toBe("#4B3FA8");
    expect(style["--yy-accent-dark"]).toBe("#4B3FA8");
    expect(Object.keys(style)).toHaveLength(8);
  });
});
