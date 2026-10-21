import {
  ID_CARD_LINE_HEIGHT,
  PT_TO_MM,
  type IdCardElementSizes,
  type IdCardLayoutElement,
  type IdCardPrintSettings,
} from "./model";

/** Square items: their size is both width and height. */
export const SQUARE_ELEMENTS: ReadonlySet<IdCardLayoutElement> = new Set(["qr", "logo", "eventLogo", "symbol", "photo"]);
/** Items that draw an image or code rather than text. */
const GRAPHIC_ELEMENTS: ReadonlySet<IdCardLayoutElement> = new Set(["qr", "logo", "eventLogo", "symbol", "photo", "sponsors"]);

export function isSquareElement(element: IdCardLayoutElement) {
  return SQUARE_ELEMENTS.has(element);
}

export function isTextElement(element: IdCardLayoutElement): element is "header" | "name" | "email" | "details" | "footer" | "idNumber" | "validUntil" {
  return !GRAPHIC_ELEMENTS.has(element);
}

/** Smallest size per item, in millimetres. */
export function minimumElementSizeMm(element: IdCardLayoutElement) {
  if (element === "symbol") return 7;
  if (element === "photo") return 8;
  if (SQUARE_ELEMENTS.has(element)) return 10;
  return 20;
}

/** The small label above the heading scales with it: about half the heading size, 5.5–9pt. */
export function badgeLabelPt(headerPt: number) {
  return Math.min(9, Math.max(5.5, Math.round(headerPt * 0.5 * 2) / 2));
}

/** Layout scale relative to A6 (1 on A6), so small stock gets proportionally smaller text and margins. */
export function paperScale(widthMm: number, heightMm: number) {
  return Math.min(1.6, Math.max(0.45, Math.min(widthMm, heightMm) / 105));
}

export const round1 = (value: number) => Math.round(value * 10) / 10;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Point size that keeps `text` on one line within `widthMm`, never above
 * `sizePt` and never below `minRatio` of it (then it wraps instead). Uses an
 * average glyph width, which is close enough for names in sans-serif type.
 */
export function fitTextSizePt(text: string, widthMm: number, sizePt: number, bold: boolean, minRatio = 0.6) {
  const chars = Math.max(1, text.trim().length);
  const emPerChar = bold ? 0.6 : 0.54;
  const fitting = widthMm / (chars * emPerChar * 0.3528);
  return round1(Math.max(sizePt * minRatio, Math.min(sizePt, fitting)));
}

/**
 * The name's point size after auto-fit. The bold template prints names in
 * capitals, which run about 15% wider than mixed case, so it fits them in a
 * slightly narrower measure.
 */
export function nameSizePt(settings: IdCardPrintSettings, name: string) {
  const size = settings.elementTextSizes.name;
  if (!settings.nameAutoFit) return size;
  const uppercase = idCardTemplateDecor(settings.template, settings.widthMm, settings.heightMm).nameUppercase;
  const widthMm = uppercase ? settings.elementSizes.name / 1.15 : settings.elementSizes.name;
  const bold = settings.elementBold.name || uppercase;
  const fitted = fitTextSizePt(name, widthMm, size, bold);
  // A name too long for two lines at the auto-fit floor would spill over the
  // email below. Shrink until its wrapped lines fit the room kept for the name
  // (nameBlockHeightMm: 1.2 lines at full size). Lines ≈ chars·em·pt/width, and
  // lines·pt must stay within 1.2·size, so pt ≤ √(1.2·size·width / (chars·em));
  // 0.85 leaves room for words that wrap early.
  const emMm = (bold ? 0.6 : 0.54) * PT_TO_MM;
  const chars = Math.max(1, name.trim().length);
  const area = 0.85 * Math.sqrt((1.2 * size * widthMm) / (chars * emMm));
  return round1(Math.min(fitted, Math.max(size * 0.3, area)));
}

/**
 * The fixed, non-draggable look of each template, shared by the on-screen
 * card, the print sheet and the server renderer so all draw the same rules,
 * frame and band. Colours come from the palette (lib/badge/palette.ts).
 */
export type IdCardTemplateDecor = {
  /** Classic: a thin frame inset from the paper edge (inside printers' unprintable margin). */
  frame: { insetMm: number; ruleMm: number; radiusMm: number } | null;
  /** Classic: a hairline under the heading block. */
  headerRule: { gapMm: number; ruleMm: number } | null;
  /** Bold: the heading block becomes a solid band in the accent colour. */
  band: { padXMm: number; padYMm: number; radiusMm: number } | null;
  /** Space between the small badge label and the heading. */
  labelGapMm: number;
  /** Letter spacing for the attendee name, in em. */
  nameTrackingEm: number;
  /** Bold prints names in capitals. */
  nameUppercase: boolean;
};

export const marginMm = (k: number) => Math.max(3, round1(10 * k));
export const bandInsetMm = (k: number) => Math.max(4, round1(5 * k));

export function idCardTemplateDecor(template: IdCardPrintSettings["template"], widthMm: number, heightMm: number): IdCardTemplateDecor {
  const k = paperScale(widthMm, heightMm);
  const labelGapMm = Math.max(1, round1(2 * k));
  if (template === "bold") {
    return {
      frame: null,
      headerRule: null,
      band: { padXMm: Math.max(2, round1(marginMm(k) - bandInsetMm(k))), padYMm: Math.max(2, round1(4.5 * k)), radiusMm: Math.max(1, round1(2 * k)) },
      labelGapMm,
      nameTrackingEm: 0,
      nameUppercase: true,
    };
  }
  if (template === "minimal") {
    return { frame: null, headerRule: null, band: null, labelGapMm, nameTrackingEm: -0.02, nameUppercase: false };
  }
  return {
    frame: { insetMm: Math.max(2.5, round1(5 * k)), ruleMm: 0.3, radiusMm: Math.max(1, round1(2.5 * k)) },
    headerRule: { gapMm: Math.max(1.5, round1(3 * k)), ruleMm: 0.25 },
    band: null,
    labelGapMm,
    nameTrackingEm: -0.02,
    nameUppercase: false,
  };
}

/**
 * Estimated height of the heading block (label, one line of heading, and the
 * template's rule or band padding). Used to keep the name clear of it.
 */
export function estimateHeaderHeightMm(
  template: IdCardPrintSettings["template"],
  headerPt: number,
  widthMm: number,
  heightMm: number,
  options: { label?: boolean; headingLines?: number } = {},
) {
  const decor = idCardTemplateDecor(template, widthMm, heightMm);
  const label = options.label === false ? 0 : badgeLabelPt(headerPt) * PT_TO_MM * ID_CARD_LINE_HEIGHT.label + decor.labelGapMm;
  let height = label + headerPt * PT_TO_MM * ID_CARD_LINE_HEIGHT.heading * (options.headingLines ?? 1);
  if (decor.headerRule) height += decor.headerRule.gapMm + decor.headerRule.ruleMm;
  if (decor.band) height += decor.band.padYMm * 2;
  return round1(height);
}

/** Room kept for the name: one line at full size, or two lines once auto-fit has shrunk it to 60%. */
export function nameBlockHeightMm(namePt: number) {
  return round1(namePt * PT_TO_MM * ID_CARD_LINE_HEIGHT.name * 1.2);
}

/** Height of the sponsor logo strip on this paper. */
export function sponsorStripHeightMm(widthMm: number, heightMm: number) {
  return clamp(round1(10 * paperScale(widthMm, heightMm)), 6, 14);
}

/** Clear space kept around the Space Works symbol: a quarter of its height, rounded up. */
export function symbolClearSpaceMm(symbolSizeMm: number) {
  return Math.ceil(symbolSizeMm * 2.5) / 10;
}

/** Height an item occupies for keeping it on the card (text items only need their top on the card). */
export function elementBoxHeightMm(element: IdCardLayoutElement, sizes: IdCardElementSizes, widthMm: number, heightMm: number) {
  if (SQUARE_ELEMENTS.has(element)) return sizes[element];
  if (element === "sponsors") return sponsorStripHeightMm(widthMm, heightMm);
  return 0;
}

/**
 * Point size for a text watermark: about three quarters of the card's
 * diagonal (or width, unrotated), never taller than 40% of the short side.
 * Shared by the preview and the renderer, so both draw the same size.
 */
export function watermarkSizePt(text: string, widthMm: number, heightMm: number, angleDeg: number) {
  const chars = Math.max(1, [...text.trim()].length);
  const span = angleDeg === 0 ? widthMm : Math.hypot(widthMm, heightMm) * 0.85;
  const fitting = (span * 0.75) / (chars * 0.62 * PT_TO_MM);
  const tallest = (Math.min(widthMm, heightMm) * 0.4) / PT_TO_MM;
  return round1(Math.max(6, Math.min(fitting, tallest)));
}
