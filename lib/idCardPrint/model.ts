import type { BadgeAccentKey, BadgeBackgroundKey, BadgeColorMode, BadgeTextKey } from "@/lib/badge/palette";

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

/** Millimetres per typographic point. */
export const PT_TO_MM = 0.3528;

/** Line heights shared by the preview and the print sheet. */
export const ID_CARD_LINE_HEIGHT = { label: 1.2, heading: 1.1, name: 1.1, body: 1.25 } as const;

/** White padding around the QR code and logo tiles. */
export const TILE_PADDING_MM = 1;
/** Space between rows of registration answers, and between label and answer. */
export const DETAILS_ROW_GAP_MM = 1.5;
export const DETAILS_COLUMN_GAP_MM = 4;
