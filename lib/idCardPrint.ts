import {
  BADGE_ACCENT_KEYS,
  BADGE_BACKGROUND_KEYS,
  BADGE_TEXT_KEYS,
  type BadgeAccentKey,
  type BadgeBackgroundKey,
  type BadgeColorMode,
  type BadgeTextKey,
} from "@/lib/badge/palette";

export const ID_CARD_LAYOUT_ELEMENTS = [
  "header", "name", "email", "details", "qr", "footer", "logo",
  "eventLogo", "symbol", "photo", "sponsors", "idNumber", "validUntil",
] as const;

export type IdCardLayoutElement = (typeof ID_CARD_LAYOUT_ELEMENTS)[number];
export type IdCardElementPosition = { xMm: number; yMm: number };
export type IdCardElementPositions = Record<IdCardLayoutElement, IdCardElementPosition>;
export type IdCardElementSizes = Record<IdCardLayoutElement, number>;
export type IdCardElementBold = Record<IdCardLayoutElement, boolean>;
export type IdCardElementTextSizes = Record<IdCardLayoutElement, number>;
export const ID_CARD_GRID_SIZES_MM = [1, 2, 5, 10] as const;
export type IdCardGridSizeMm = (typeof ID_CARD_GRID_SIZES_MM)[number];

/** Square items: their size is both width and height. */
const SQUARE_ELEMENTS: ReadonlySet<IdCardLayoutElement> = new Set(["qr", "logo", "eventLogo", "symbol", "photo"]);
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

export const SPONSOR_LIMIT_MAX = 6;

export const WATERMARK_KINDS = ["none", "text", "image"] as const;
export const WATERMARK_COLOURS = ["accent", "text"] as const;
export const WATERMARK_OPACITY_MIN = 4;
export const WATERMARK_OPACITY_MAX = 30;

/**
 * A faint mark behind everything on the card: a short word (rotated) or an
 * uploaded image, in a brand-safe colour at low opacity. Image watermarks use
 * the artwork in `BadgeBranding.watermarkUrl`.
 */
export type IdCardWatermark = {
  kind: (typeof WATERMARK_KINDS)[number];
  text: string;
  /** Percent, 4–30. */
  opacityPct: number;
  colour: (typeof WATERMARK_COLOURS)[number];
  /** Rotation for text watermarks, in degrees (clockwise). */
  angleDeg: number;
};

export const DEFAULT_WATERMARK: IdCardWatermark = { kind: "none", text: "", opacityPct: 10, colour: "accent", angleDeg: -30 };

export type IdCardPrintSettings = {
  widthMm: number;
  heightMm: number;
  heading: string;
  badgeLabel: string;
  showEmail: boolean;
  template: "classic" | "bold" | "minimal";
  footerText: string;
  /** The organisation logo (layout item `logo`). */
  showLogo: boolean;
  /** Fields chosen by the organiser for the lower portion of each card. */
  printFieldKeys: string[];
  /** Optional per-card labels; keys correspond to `printFieldKeys`. */
  printFieldLabels: Record<string, string>;
  /** Upper-left positions used by the interactive, millimetre-based card layout. */
  elementPositions: IdCardElementPositions;
  /** Width in millimetres for text elements and the sponsor strip; square size for graphics. */
  elementSizes: IdCardElementSizes;
  /** Whether each text element should use a heavier weight. */
  elementBold: IdCardElementBold;
  /** Point size for each text element; graphic entries are unused. */
  elementTextSizes: IdCardElementTextSizes;
  /** Design-surface preferences saved with this event's card settings. */
  gridSizeMm: IdCardGridSizeMm;
  showGrid: boolean;
  /** Shrink long attendee names (down to 60%) so they stay on one line. */
  nameAutoFit: boolean;
  showBadgeLabel: boolean;
  showFooter: boolean;
  /** "mono" is the print-economy mode: black on white only, for laser and thermal printers. */
  colorMode: BadgeColorMode;
  backgroundColor: BadgeBackgroundKey;
  /** Band, frame and rules. */
  accentColor: BadgeAccentKey;
  textColor: BadgeTextKey;
  showEventLogo: boolean;
  /** The Space Works symbol. */
  showSymbol: boolean;
  showPhoto: boolean;
  photoShape: "circle" | "rounded";
  showSponsors: boolean;
  sponsorLimit: number;
  /** The person's name. Off for a card back that carries only details. */
  showName: boolean;
  /** The QR code. Off for a side that doesn't need one. */
  showQr: boolean;
  /** Member ID cards: the human-readable ID number (layout item `idNumber`). */
  showIdNumber: boolean;
  idNumberLabel: string;
  /** Member ID cards: the expiry date (layout item `validUntil`). */
  showValidUntil: boolean;
  validUntilLabel: string;
  watermark: IdCardWatermark;
};

/** The optional items whose presence changes the default layout. */
export type IdCardLayoutFlags = Pick<IdCardPrintSettings, "showLogo" | "showEventLogo" | "showSymbol" | "showPhoto" | "showSponsors">
  & Partial<Pick<IdCardPrintSettings, "showIdNumber" | "showValidUntil">>;

export const DEFAULT_LAYOUT_FLAGS: IdCardLayoutFlags = { showLogo: true, showEventLogo: false, showSymbol: true, showPhoto: false, showSponsors: false };

export function layoutFlags(settings: IdCardLayoutFlags): IdCardLayoutFlags {
  return {
    showLogo: settings.showLogo,
    showEventLogo: settings.showEventLogo,
    showSymbol: settings.showSymbol,
    showPhoto: settings.showPhoto,
    showSponsors: settings.showSponsors,
    ...(settings.showIdNumber ? { showIdNumber: true } : {}),
    ...(settings.showValidUntil ? { showValidUntil: true } : {}),
  };
}

export const A6_PORTRAIT = { widthMm: 105, heightMm: 148 };
export const A6_LANDSCAPE = { widthMm: 148, heightMm: 105 };
export const CR80 = { widthMm: 85.6, heightMm: 53.98 };

/** Common badge stocks. Portrait sizes; the designer offers the landscape turn. */
export const ID_CARD_PAPER_PRESETS = [
  { id: "a6", label: "A6", detail: "105 × 148 mm · sheet paper", widthMm: 105, heightMm: 148 },
  { id: "4x6", label: "4 × 6 in", detail: "Label printer badge", widthMm: 101.6, heightMm: 152.4 },
  { id: "3x4", label: "3 × 4 in", detail: "Lanyard pouch badge", widthMm: 76.2, heightMm: 101.6 },
  { id: "4x3", label: "4 × 3 in", detail: "Landscape pouch badge", widthMm: 101.6, heightMm: 76.2 },
  { id: "cr80", label: "ID card (CR80)", detail: "85.6 × 54 mm · PVC card", widthMm: 85.6, heightMm: 53.98 },
] as const;

export function matchPaperPreset(widthMm: number, heightMm: number) {
  const close = (a: number, b: number) => Math.abs(a - b) < 0.6;
  for (const preset of ID_CARD_PAPER_PRESETS) {
    if (close(preset.widthMm, widthMm) && close(preset.heightMm, heightMm)) return { preset, rotated: false };
    if (close(preset.widthMm, heightMm) && close(preset.heightMm, widthMm)) return { preset, rotated: true };
  }
  return null;
}

/** The small label above the heading scales with it: about half the heading size, 5.5–9pt. */
export function badgeLabelPt(headerPt: number) {
  return Math.min(9, Math.max(5.5, Math.round(headerPt * 0.5 * 2) / 2));
}

/** Layout scale relative to A6 (1 on A6), so small stock gets proportionally smaller text and margins. */
export function paperScale(widthMm: number, heightMm: number) {
  return Math.min(1.6, Math.max(0.45, Math.min(widthMm, heightMm) / 105));
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

const MIN_DIMENSION_MM = 40;
/** Footers on event badges are edited up to 80 characters; a member card back may carry a longer note. */
export const FOOTER_MAX_LENGTH = 240;
const MAX_DIMENSION_MM = 300;

function boundedDimension(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(MAX_DIMENSION_MM, Math.max(MIN_DIMENSION_MM, Math.round(numberValue * 10) / 10));
}

function boundedText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength) || fallback;
}

function printableFieldKeys(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const keys = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 160 && !item.startsWith("system:"))
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 16);
  return keys;
}

function printableFieldLabels(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, label]) => key.length <= 160 && typeof label === "string")
      .map(([key, label]) => [key, label.trim().slice(0, 60)])
      .slice(0, 16),
  );
}

/** Millimetres per typographic point. */
export const PT_TO_MM = 0.3528;

/** Line heights shared by the preview and the print sheet. */
export const ID_CARD_LINE_HEIGHT = { label: 1.2, heading: 1.1, name: 1.1, body: 1.25 } as const;

/** White padding around the QR code and logo tiles. */
export const TILE_PADDING_MM = 1;
/** Space between rows of registration answers, and between label and answer. */
export const DETAILS_ROW_GAP_MM = 1.5;
export const DETAILS_COLUMN_GAP_MM = 4;

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

const marginMm = (k: number) => Math.max(3, round1(10 * k));
const bandInsetMm = (k: number) => Math.max(4, round1(5 * k));

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

/**
 * Default boxes for a template on the given paper. Tuned on A6 portrait;
 * other stock scales margins and type with the paper. Content stacks from the
 * top (heading, photo, name, email, answers); the QR sits in the bottom-right
 * corner, and the Space Works symbol and footer along the bottom-left, so
 * nothing overlaps on any preset.
 */
function defaultGeometry(template: IdCardPrintSettings["template"], widthMm: number, heightMm: number, flags: IdCardLayoutFlags) {
  const k = paperScale(widthMm, heightMm);
  const m = marginMm(k);
  const decor = idCardTemplateDecor(template, widthMm, heightMm);
  const text = defaultIdCardElementTextSizes(template, widthMm, heightMm);
  const line = (pt: number) => pt * PT_TO_MM * ID_CARD_LINE_HEIGHT.body;
  const width = (mm: number) => Math.max(20, round1(mm));

  const qrSize = Math.min(40, Math.max(16, round1((template === "minimal" ? 21 : 24) * k)));
  const logoSize = Math.min(20, Math.max(10, round1((template === "minimal" ? 10 : 12) * k)));
  const symbolSize = clamp(round1(9 * k), 7, 14);
  const photoSize = clamp(round1(24 * k), 12, 34);
  // The QR block has 1 mm of white padding; align the code itself with the margin.
  const qr = { xMm: round1(widthMm - m - qrSize - 1), yMm: round1(heightMm - m - qrSize - 1) };
  const qrLeft = qr.xMm + 1;

  const inset = bandInsetMm(k);
  const header = decor.band ? { xMm: inset, yMm: inset } : { xMm: m, yMm: m };
  const textX = decor.band ? round1(inset + decor.band.padXMm) : m;
  const leftOfQr = qrLeft - textX - 4 * k;

  // Bold keeps the band clean: its logo sits beside the QR at the bottom, or
  // above the QR when the card is too narrow to share the bottom row.
  let logo = { xMm: round1(widthMm - m - logoSize), yMm: m };
  let footerWidth = leftOfQr;
  let sponsorsWidth = leftOfQr;
  if (template === "bold") {
    const besideX = qrLeft - 4 * k - logoSize;
    if (besideX - textX - 3 * k >= 30) {
      logo = { xMm: round1(besideX), yMm: round1(heightMm - m - logoSize) };
      footerWidth = besideX - textX - 3 * k;
      if (flags.showLogo) sponsorsWidth = footerWidth;
    } else {
      logo = { xMm: round1(widthMm - m - logoSize), yMm: round1(qr.yMm + 1 - 3 * k - logoSize) };
    }
  }

  // The event logo sits at the top right, to the left of the organisation
  // logo when that also sits up there; the heading stops short of both.
  const logoAtTop = template !== "bold" && flags.showLogo;
  const eventLogo = template === "bold"
    ? { xMm: round1(widthMm - inset - logoSize), yMm: inset }
    : { xMm: round1(logoAtTop ? logo.xMm - 3 * k - logoSize : widthMm - m - logoSize), yMm: m };
  const headerRight = flags.showEventLogo
    ? (template === "bold" ? eventLogo.xMm - 2 * k : eventLogo.xMm - 4 * k)
    : (template === "bold" ? widthMm - inset : logo.xMm - 4 * k);
  const headerWidth = decor.band ? width(headerRight - inset) : width(headerRight - textX);

  // Footer row: the symbol, its clear space, then the footer text beside it.
  // On narrow stock the footer needs the whole row, so the symbol stands above it.
  const footerLine = line(text.footer);
  const symbolGap = Math.max(symbolClearSpaceMm(symbolSize), round1(2 * k));
  const besideFooter = footerWidth - symbolSize - symbolGap >= 20;
  const plainFooter = { xMm: textX, yMm: round1(heightMm - m - footerLine) };
  const symbol = besideFooter
    ? { xMm: textX, yMm: round1(heightMm - m - symbolSize) }
    : { xMm: textX, yMm: round1(plainFooter.yMm - symbolGap - symbolSize) };
  const footer = flags.showSymbol && besideFooter
    ? { xMm: round1(textX + symbolSize + symbolGap), yMm: round1(heightMm - m - symbolSize / 2 - footerLine / 2) }
    : plainFooter;
  const footerRowTop = flags.showSymbol ? symbol.yMm : footer.yMm;
  const footerBoxWidth = flags.showSymbol && besideFooter ? footerWidth - symbolSize - symbolGap : footerWidth;

  const headerBottom = header.yMm + estimateHeaderHeightMm(template, text.header, widthMm, heightMm);
  const nameRatio = template === "bold" ? 0.26 : template === "minimal" ? 0.36 : 0.3;
  const landscape = widthMm > heightMm * 1.15;
  let nameY = round1(Math.max(headerBottom + (template === "minimal" ? 8 : 6) * k, heightMm * nameRatio));
  let contentX = textX;
  let photo = { xMm: textX, yMm: round1(headerBottom + 4 * k) };
  if (flags.showPhoto) {
    if (landscape) {
      // Landscape: the photo stands beside the name block.
      photo = { xMm: textX, yMm: nameY };
      contentX = round1(textX + photoSize + 3 * k);
    } else {
      // Portrait: the photo sits under the heading and the name below it.
      nameY = round1(photo.yMm + photoSize + 3 * k);
    }
  } else if (landscape) {
    photo = { xMm: textX, yMm: nameY };
  }
  const emailY = round1(nameY + nameBlockHeightMm(text.name) + 1.5 * k);
  // Member ID items stack under the email; event badges never turn them on,
  // so their layout is unchanged.
  const idNumberY = round1(emailY + line(text.email) + 2 * k);
  const validUntilY = round1(idNumberY + (flags.showIdNumber ? line(text.idNumber) + 1 * k : 0));
  const memberBottom = flags.showValidUntil ? validUntilY + line(text.validUntil) : flags.showIdNumber ? idNumberY + line(text.idNumber) : null;
  const detailsY = round1(memberBottom === null ? emailY + line(text.email) + 4 * k : memberBottom + 3 * k);

  // On landscape stock the QR sits beside the text, so text stops short of it.
  const full = widthMm - contentX - m;
  const nameWidth = width(landscape ? Math.min(full, leftOfQr - (contentX - textX)) : full);
  const sponsorsHeight = sponsorStripHeightMm(widthMm, heightMm);
  const sponsors = { xMm: textX, yMm: round1(footerRowTop - Math.max(2 * k, symbolGap) - sponsorsHeight) };

  const positions: IdCardElementPositions = {
    header,
    name: { xMm: contentX, yMm: nameY },
    email: { xMm: contentX, yMm: emailY },
    details: { xMm: contentX, yMm: detailsY },
    qr,
    footer,
    logo,
    eventLogo,
    symbol,
    photo,
    sponsors,
    idNumber: { xMm: contentX, yMm: idNumberY },
    validUntil: { xMm: contentX, yMm: validUntilY },
  };
  const sizes: IdCardElementSizes = {
    header: headerWidth,
    name: nameWidth,
    email: nameWidth,
    details: width(leftOfQr - (contentX - textX)),
    qr: qrSize,
    footer: width(footerBoxWidth),
    logo: logoSize,
    eventLogo: logoSize,
    symbol: symbolSize,
    photo: photoSize,
    sponsors: width(sponsorsWidth),
    idNumber: nameWidth,
    validUntil: nameWidth,
  };
  return { positions, sizes };
}

/** Where an optional item goes when it is turned on, without reflowing the rest. */
function geometryWithOptionalDefaults(template: IdCardPrintSettings["template"], widthMm: number, heightMm: number, flags: IdCardLayoutFlags) {
  const base = defaultGeometry(template, widthMm, heightMm, flags);
  const optional: Array<[keyof IdCardLayoutFlags, IdCardLayoutElement]> = [
    ["showEventLogo", "eventLogo"], ["showSymbol", "symbol"], ["showPhoto", "photo"], ["showSponsors", "sponsors"],
    ["showIdNumber", "idNumber"], ["showValidUntil", "validUntil"],
  ];
  for (const [flag, element] of optional) {
    if (flags[flag]) continue;
    const enabled = defaultGeometry(template, widthMm, heightMm, { ...flags, [flag]: true });
    base.positions[element] = enabled.positions[element];
    base.sizes[element] = enabled.sizes[element];
  }
  return base;
}

export function defaultIdCardElementPositions(
  template: IdCardPrintSettings["template"],
  widthMm: number,
  heightMm: number,
  flags: IdCardLayoutFlags = DEFAULT_LAYOUT_FLAGS,
): IdCardElementPositions {
  return geometryWithOptionalDefaults(template, widthMm, heightMm, flags).positions;
}

export function defaultIdCardElementSizes(
  template: IdCardPrintSettings["template"],
  widthMm: number,
  heightMm: number = A6_PORTRAIT.heightMm,
  flags: IdCardLayoutFlags = DEFAULT_LAYOUT_FLAGS,
): IdCardElementSizes {
  return geometryWithOptionalDefaults(template, widthMm, heightMm, flags).sizes;
}

export function defaultIdCardElementBold(): IdCardElementBold {
  return {
    header: true, name: true, email: false, details: false, qr: false, footer: false, logo: false,
    eventLogo: false, symbol: false, photo: false, sponsors: false, idNumber: true, validUntil: false,
  };
}

export function defaultIdCardElementTextSizes(
  template: IdCardPrintSettings["template"] = "classic",
  widthMm: number = A6_PORTRAIT.widthMm,
  heightMm: number = A6_PORTRAIT.heightMm,
): IdCardElementTextSizes {
  // The name is always the largest thing on the card; the heading stays small.
  const base = template === "bold"
    ? { header: 14, name: 28, email: 10, details: 8.5, footer: 7.5, idNumber: 11, validUntil: 8.5 }
    : template === "minimal"
      ? { header: 10, name: 30, email: 9.5, details: 8.5, footer: 7.5, idNumber: 10, validUntil: 8.5 }
      : { header: 13, name: 30, email: 10, details: 8.5, footer: 7.5, idNumber: 11, validUntil: 8.5 };
  const k = paperScale(widthMm, heightMm);
  const scaled = (pt: number, min: number) => Math.max(min, Math.round(pt * k * 2) / 2);
  return {
    header: scaled(base.header, 6), name: scaled(base.name, 9), email: scaled(base.email, 6),
    details: scaled(base.details, 6), qr: 0, footer: scaled(base.footer, 6), logo: 0,
    eventLogo: 0, symbol: 0, photo: 0, sponsors: 0,
    idNumber: scaled(base.idNumber, 6), validUntil: scaled(base.validUntil, 6),
  };
}

function boundedPosition(value: unknown, fallback: IdCardElementPosition, widthMm: number, heightMm: number) {
  if (!value || typeof value !== "object") return fallback;
  const input = value as Partial<IdCardElementPosition>;
  const x = typeof input.xMm === "number" ? input.xMm : Number(input.xMm);
  const y = typeof input.yMm === "number" ? input.yMm : Number(input.yMm);
  return {
    xMm: Number.isFinite(x) ? Math.min(widthMm - 4, Math.max(0, Math.round(x * 10) / 10)) : fallback.xMm,
    yMm: Number.isFinite(y) ? Math.min(heightMm - 4, Math.max(0, Math.round(y * 10) / 10)) : fallback.yMm,
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<Record<IdCardLayoutElement, unknown>>
    : {};
}

function elementPositions(value: unknown, fallback: IdCardElementPositions, widthMm: number, heightMm: number) {
  const input = asRecord(value);
  return Object.fromEntries(ID_CARD_LAYOUT_ELEMENTS.map((element) => [
    element,
    boundedPosition(input[element], fallback[element], widthMm, heightMm),
  ])) as IdCardElementPositions;
}

function elementSizes(value: unknown, fallback: IdCardElementSizes, widthMm: number) {
  const input = asRecord(value);
  return Object.fromEntries(ID_CARD_LAYOUT_ELEMENTS.map((element) => {
    const size = typeof input[element] === "number" ? input[element] : Number(input[element]);
    const minimum = minimumElementSizeMm(element);
    const maximum = Math.max(minimum, widthMm - 4);
    return [element, Number.isFinite(size) ? Math.min(maximum, Math.max(minimum, Math.round(size * 10) / 10)) : fallback[element]];
  })) as IdCardElementSizes;
}

/** Height an item occupies for keeping it on the card (text items only need their top on the card). */
export function elementBoxHeightMm(element: IdCardLayoutElement, sizes: IdCardElementSizes, widthMm: number, heightMm: number) {
  if (SQUARE_ELEMENTS.has(element)) return sizes[element];
  if (element === "sponsors") return sponsorStripHeightMm(widthMm, heightMm);
  return 0;
}

function fitElementPositions(
  positions: IdCardElementPositions,
  sizes: IdCardElementSizes,
  widthMm: number,
  heightMm: number,
) {
  return Object.fromEntries(ID_CARD_LAYOUT_ELEMENTS.map((element) => {
    const boxHeight = elementBoxHeightMm(element, sizes, widthMm, heightMm);
    return [element, {
      xMm: Math.min(Math.max(0, widthMm - sizes[element] - 4), positions[element].xMm),
      yMm: boxHeight > 0 ? Math.min(Math.max(0, heightMm - boxHeight - 4), positions[element].yMm) : positions[element].yMm,
    }];
  })) as IdCardElementPositions;
}

function elementBold(value: unknown) {
  const fallback = defaultIdCardElementBold();
  const input = asRecord(value);
  return Object.fromEntries(ID_CARD_LAYOUT_ELEMENTS.map((element) => [
    element,
    isTextElement(element) && typeof input[element] === "boolean" ? input[element] : fallback[element],
  ])) as IdCardElementBold;
}

function elementTextSizes(value: unknown, template: IdCardPrintSettings["template"], widthMm: number, heightMm: number) {
  const fallback = defaultIdCardElementTextSizes(template, widthMm, heightMm);
  const input = asRecord(value);
  return Object.fromEntries(ID_CARD_LAYOUT_ELEMENTS.map((element) => {
    if (!isTextElement(element)) return [element, 0];
    const size = typeof input[element] === "number" ? input[element] : Number(input[element]);
    return [element, Number.isFinite(size) ? Math.min(48, Math.max(6, Math.round(size * 10) / 10)) : fallback[element]];
  })) as IdCardElementTextSizes;
}

function gridSizeMm(value: unknown): IdCardGridSizeMm {
  const numberValue = typeof value === "number" ? value : Number(value);
  return ID_CARD_GRID_SIZES_MM.find((size) => size === numberValue) ?? 5;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function defaultIdCardPrintSettings(eventTitle: string, organisationName = ""): IdCardPrintSettings {
  return {
    ...A6_PORTRAIT,
    heading: eventTitle.trim().slice(0, 120) || "Event attendee",
    badgeLabel: "ATTENDEE",
    showEmail: true,
    template: "classic",
    footerText: organisationName.trim().slice(0, 80) || "Event check-in",
    printFieldKeys: [],
    printFieldLabels: {},
    elementPositions: defaultIdCardElementPositions("classic", A6_PORTRAIT.widthMm, A6_PORTRAIT.heightMm),
    elementSizes: defaultIdCardElementSizes("classic", A6_PORTRAIT.widthMm, A6_PORTRAIT.heightMm),
    elementBold: defaultIdCardElementBold(),
    elementTextSizes: defaultIdCardElementTextSizes("classic"),
    gridSizeMm: 5,
    showGrid: true,
    nameAutoFit: true,
    showBadgeLabel: true,
    showFooter: true,
    colorMode: "colour",
    backgroundColor: "white",
    accentColor: "event",
    textColor: "auto",
    ...DEFAULT_LAYOUT_FLAGS,
    photoShape: "circle",
    sponsorLimit: 4,
    showName: true,
    showQr: true,
    showIdNumber: false,
    idNumberLabel: "ID",
    showValidUntil: false,
    validUntilLabel: "Valid until",
    watermark: { ...DEFAULT_WATERMARK },
  };
}

function watermark(value: unknown): IdCardWatermark {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_WATERMARK };
  const input = value as Partial<Record<keyof IdCardWatermark, unknown>>;
  const opacity = Number(input.opacityPct);
  const angle = Number(input.angleDeg);
  return {
    kind: oneOf(input.kind, WATERMARK_KINDS, DEFAULT_WATERMARK.kind),
    text: typeof input.text === "string" ? input.text.trim().slice(0, 32) : "",
    opacityPct: Number.isFinite(opacity) ? clamp(Math.round(opacity), WATERMARK_OPACITY_MIN, WATERMARK_OPACITY_MAX) : DEFAULT_WATERMARK.opacityPct,
    colour: oneOf(input.colour, WATERMARK_COLOURS, DEFAULT_WATERMARK.colour),
    angleDeg: Number.isFinite(angle) ? clamp(Math.round(angle), -90, 90) : DEFAULT_WATERMARK.angleDeg,
  };
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

/**
 * Keep saved settings safe and usable before printing. Anything unexpected is
 * replaced by a default. Designs saved before colour and logos existed (no
 * `colorMode`) keep their black-and-white look and gain no new items.
 */
export function normalizeIdCardPrintSettings(
  value: unknown,
  eventTitle: string,
  organisationName = "",
): IdCardPrintSettings {
  const fallback = defaultIdCardPrintSettings(eventTitle, organisationName);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const input = value as Partial<Record<keyof IdCardPrintSettings, unknown>>;
  const legacy = Object.keys(input).length > 0 && !("colorMode" in input);
  const widthMm = boundedDimension(input.widthMm, fallback.widthMm);
  const heightMm = boundedDimension(input.heightMm, fallback.heightMm);
  const template = oneOf(input.template, ["classic", "bold", "minimal"] as const, fallback.template);
  const flags: IdCardLayoutFlags = {
    showLogo: bool(input.showLogo, fallback.showLogo),
    showEventLogo: bool(input.showEventLogo, legacy ? false : fallback.showEventLogo),
    showSymbol: bool(input.showSymbol, legacy ? false : fallback.showSymbol),
    showPhoto: bool(input.showPhoto, legacy ? false : fallback.showPhoto),
    showSponsors: bool(input.showSponsors, legacy ? false : fallback.showSponsors),
    showIdNumber: bool(input.showIdNumber, fallback.showIdNumber),
    showValidUntil: bool(input.showValidUntil, fallback.showValidUntil),
  };
  const defaults = geometryWithOptionalDefaults(template, widthMm, heightMm, flags);
  const sizes = elementSizes(input.elementSizes, defaults.sizes, widthMm);
  const positions = elementPositions(input.elementPositions, defaults.positions, widthMm, heightMm);
  const sponsorLimit = Number(input.sponsorLimit);
  return {
    widthMm,
    heightMm,
    heading: boundedText(input.heading, fallback.heading, 120),
    badgeLabel: boundedText(input.badgeLabel, fallback.badgeLabel, 40),
    showEmail: bool(input.showEmail, fallback.showEmail),
    template,
    footerText: boundedText(input.footerText, fallback.footerText, FOOTER_MAX_LENGTH),
    printFieldKeys: printableFieldKeys(input.printFieldKeys, fallback.printFieldKeys),
    printFieldLabels: printableFieldLabels(input.printFieldLabels),
    elementPositions: fitElementPositions(positions, sizes, widthMm, heightMm),
    elementSizes: sizes,
    elementBold: elementBold(input.elementBold),
    elementTextSizes: elementTextSizes(input.elementTextSizes, template, widthMm, heightMm),
    gridSizeMm: gridSizeMm(input.gridSizeMm),
    showGrid: bool(input.showGrid, fallback.showGrid),
    nameAutoFit: bool(input.nameAutoFit, fallback.nameAutoFit),
    showBadgeLabel: bool(input.showBadgeLabel, fallback.showBadgeLabel),
    showFooter: bool(input.showFooter, fallback.showFooter),
    colorMode: legacy ? "mono" : oneOf(input.colorMode, ["colour", "mono"] as const, fallback.colorMode),
    backgroundColor: oneOf(input.backgroundColor, BADGE_BACKGROUND_KEYS, fallback.backgroundColor),
    accentColor: oneOf(input.accentColor, BADGE_ACCENT_KEYS, fallback.accentColor),
    textColor: oneOf(input.textColor, BADGE_TEXT_KEYS, fallback.textColor),
    ...flags,
    showIdNumber: flags.showIdNumber ?? false,
    showValidUntil: flags.showValidUntil ?? false,
    photoShape: oneOf(input.photoShape, ["circle", "rounded"] as const, fallback.photoShape),
    sponsorLimit: Number.isFinite(sponsorLimit) ? clamp(Math.round(sponsorLimit), 1, SPONSOR_LIMIT_MAX) : fallback.sponsorLimit,
    showName: bool(input.showName, fallback.showName),
    showQr: bool(input.showQr, fallback.showQr),
    idNumberLabel: typeof input.idNumberLabel === "string" ? input.idNumberLabel.trim().slice(0, 30) : fallback.idNumberLabel,
    validUntilLabel: typeof input.validUntilLabel === "string" ? input.validUntilLabel.trim().slice(0, 30) : fallback.validUntilLabel,
    watermark: watermark(input.watermark),
  };
}

/** A fresh layout for `template` on the given paper: positions, sizes and text sizes together. */
export function layoutForPaper(
  template: IdCardPrintSettings["template"],
  widthMm: number,
  heightMm: number,
  flags: IdCardLayoutFlags = DEFAULT_LAYOUT_FLAGS,
) {
  const geometry = geometryWithOptionalDefaults(template, widthMm, heightMm, flags);
  return {
    elementPositions: geometry.positions,
    elementSizes: geometry.sizes,
    elementTextSizes: defaultIdCardElementTextSizes(template, widthMm, heightMm),
    elementBold: defaultIdCardElementBold(),
  };
}

/**
 * True when the layout is still exactly the default for these flags, so
 * turning an optional item on may reflow the whole card without losing any
 * hand-made adjustments.
 */
export function isDefaultLayout(settings: IdCardPrintSettings, flags: IdCardLayoutFlags = layoutFlags(settings)) {
  const fresh = layoutForPaper(settings.template, settings.widthMm, settings.heightMm, flags);
  return JSON.stringify(fresh.elementPositions) === JSON.stringify(settings.elementPositions)
    && JSON.stringify(fresh.elementSizes) === JSON.stringify(settings.elementSizes);
}

const DESIGN_FILE_KIND = "swe-id-card-design";
/** Files exported before the rename are still accepted. */
const LEGACY_DESIGN_FILE_KINDS = ["yuyu-id-card-design"];

/** A portable design file, for copying a badge design to another event or desk. */
export function exportIdCardDesign(settings: IdCardPrintSettings): string {
  return JSON.stringify({ kind: DESIGN_FILE_KIND, version: 2, settings }, null, 2);
}

/** Read a design file; anything unexpected is normalised or rejected, never trusted. */
export function importIdCardDesign(text: string, eventTitle: string, organisationName = ""): IdCardPrintSettings | null {
  try {
    const parsed = JSON.parse(text) as { kind?: unknown; settings?: unknown };
    const kind = parsed?.kind;
    if (!parsed || typeof kind !== "string" || (kind !== DESIGN_FILE_KIND && !LEGACY_DESIGN_FILE_KINDS.includes(kind))) return null;
    if (!parsed.settings || typeof parsed.settings !== "object") return null;
    return normalizeIdCardPrintSettings(parsed.settings, eventTitle, organisationName);
  } catch {
    return null;
  }
}

/** Upper bound for a stored design, in bytes of JSON. */
export const BADGE_DESIGN_MAX_BYTES = 32_000;
