import { contrastRatio, mix, normalizeAccentHex } from "@/lib/theme/accent";

/*
 * Badge colours. Organisers pick from the Space Works brand colours plus the
 * event's own accent; every text colour is contrast-checked (WCAG AA, 4.5:1)
 * against what it sits on, and Workshop Orange is only ever a fill, never text.
 * Shared by the browser preview and the server renderer, so both agree.
 */

export const BRAND = {
  ink: "#142C2A",
  teal: "#006E63",
  orange: "#FF7447",
  citron: "#DFFF8F",
  sky: "#B5CDFF",
  yellow: "#FFD447",
  cream: "#FFF4E8",
  white: "#FFFFFF",
} as const;

/** Print-economy mode: pure black on white, which laser and thermal printers reproduce exactly. */
const MONO_INK = "#000000";

export const BADGE_BACKGROUND_KEYS = ["white", "cream", "ink", "teal", "citron", "sky", "event"] as const;
export const BADGE_ACCENT_KEYS = ["event", "teal", "ink", "orange", "citron", "sky", "yellow"] as const;
export const BADGE_TEXT_KEYS = ["auto", "ink", "teal", "cream", "white"] as const;

export type BadgeBackgroundKey = (typeof BADGE_BACKGROUND_KEYS)[number];
export type BadgeAccentKey = (typeof BADGE_ACCENT_KEYS)[number];
export type BadgeTextKey = (typeof BADGE_TEXT_KEYS)[number];
export type BadgeColorMode = "colour" | "mono";

export const BADGE_COLOUR_LABELS: Record<BadgeBackgroundKey | BadgeAccentKey | BadgeTextKey, string> = {
  auto: "Automatic",
  white: "White",
  cream: "Warm Cream",
  ink: "Deep Ink",
  teal: "Maker Teal",
  orange: "Workshop Orange",
  citron: "Citron",
  sky: "Sky Blue",
  yellow: "Warm Yellow",
  event: "Event accent",
};

/** Minimum contrast for any text on the card. */
export const BADGE_TEXT_CONTRAST = 4.5;

/** Which master of the Space Works symbol to place: never recoloured, only chosen. */
export type BadgeSymbolVariant = "full" | "reversed" | "ink";

export type BadgePalette = {
  background: string;
  /** Body text: name, email, answers, footer. */
  text: string;
  /** Heading and badge label when they are not on the band. */
  heading: string;
  /** Band fill, frame and rules. */
  accent: string;
  /** Text on the band. */
  onAccent: string;
  /** Frame and header rule colour (the accent, unless it would vanish into the background). */
  rule: string;
  /** Tile behind logos and the QR so they stay legible on any background. */
  tile: string;
  qrDark: string;
  qrLight: string;
  photoPlaceholder: string;
  onPhotoPlaceholder: string;
  symbol: BadgeSymbolVariant;
  /** True when the chosen text colour failed the contrast check and was replaced. */
  textAdjusted: boolean;
};

export function eventAccentHex(value: string | null | undefined) {
  return normalizeAccentHex(value, BRAND.teal);
}

function colourFor(key: BadgeBackgroundKey | BadgeAccentKey | Exclude<BadgeTextKey, "auto">, eventAccent: string) {
  return key === "event" ? eventAccent : BRAND[key];
}

/** Relative luminance (sRGB), for choosing light or dark artwork. */
export function relativeLuminance(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** The first candidate that reaches `ratio` against `surface`, else the one with the most contrast. */
export function readableOn(surface: string, candidates: readonly string[], ratio = BADGE_TEXT_CONTRAST) {
  const passing = candidates.find((candidate) => contrastRatio(candidate, surface) >= ratio);
  if (passing) return passing;
  return [...candidates].sort((a, b) => contrastRatio(b, surface) - contrastRatio(a, surface))[0]!;
}

/** True when `color` may be used for text on `surface`: enough contrast, and never Workshop Orange. */
export function isReadableText(color: string, surface: string) {
  return color.toUpperCase() !== BRAND.orange && contrastRatio(color, surface) >= BADGE_TEXT_CONTRAST;
}

/**
 * A mid-tone event accent (as band or card) can be too light for cream text and too dark for
 * ink. Deepen it towards Deep Ink until cream text on it reaches 4.5:1.
 */
function bandSafe(accent: string) {
  if ([BRAND.cream, BRAND.ink].some((text) => contrastRatio(text, accent) >= BADGE_TEXT_CONTRAST)) return accent;
  for (let step = 1; step <= 20; step += 1) {
    const deeper = mix(BRAND.ink, accent, step * 0.05);
    if (contrastRatio(BRAND.cream, deeper) >= BADGE_TEXT_CONTRAST) return deeper;
  }
  return BRAND.ink;
}

export function resolveBadgePalette(
  input: { colorMode: BadgeColorMode; backgroundColor: BadgeBackgroundKey; accentColor: BadgeAccentKey; textColor: BadgeTextKey },
  eventAccent: string | null | undefined,
): BadgePalette {
  if (input.colorMode === "mono") {
    return {
      background: BRAND.white,
      text: MONO_INK,
      heading: MONO_INK,
      accent: MONO_INK,
      onAccent: BRAND.white,
      rule: MONO_INK,
      tile: BRAND.white,
      qrDark: MONO_INK,
      qrLight: BRAND.white,
      photoPlaceholder: MONO_INK,
      onPhotoPlaceholder: BRAND.white,
      symbol: "ink",
      textAdjusted: false,
    };
  }
  const accentHex = eventAccentHex(eventAccent);
  const background = bandSafe(colourFor(input.backgroundColor, accentHex));
  const accent = bandSafe(colourFor(input.accentColor, accentHex));
  const automatic = readableOn(background, [BRAND.ink, BRAND.cream, BRAND.white]);
  const chosen = input.textColor === "auto" ? automatic : colourFor(input.textColor, accentHex);
  const textAdjusted = input.textColor !== "auto" && !isReadableText(chosen, background);
  const text = textAdjusted ? automatic : chosen;
  const onAccent = readableOn(accent, [BRAND.cream, BRAND.ink, BRAND.white]);
  const lightBackground = relativeLuminance(background) > 0.4;
  return {
    background,
    text,
    // The accent colours the heading only when it reads as text; orange never does.
    heading: isReadableText(accent, background) ? accent : text,
    accent,
    onAccent,
    rule: contrastRatio(accent, background) >= 1.5 ? accent : text,
    tile: BRAND.white,
    qrDark: BRAND.ink,
    qrLight: BRAND.white,
    photoPlaceholder: accent,
    onPhotoPlaceholder: onAccent,
    // Brand rules: one-colour ink on white, full colour on light brand colours, reversed on dark.
    symbol: background === BRAND.white ? "ink" : lightBackground ? "full" : "reversed",
    textAdjusted,
  };
}

export const SYMBOL_ASSET: Record<BadgeSymbolVariant, string> = {
  full: "/brand/symbol.svg",
  reversed: "/brand/symbol-reversed.svg",
  ink: "/brand/symbol-one-colour-ink.svg",
};

/** The master symbol's aspect ratio (136 × 126). */
export const SYMBOL_ASPECT = 136 / 126;
