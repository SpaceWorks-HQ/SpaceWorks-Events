import { BADGE_ACCENT_KEYS, BADGE_BACKGROUND_KEYS, BADGE_TEXT_KEYS } from "@/lib/badge/palette";
import {
  DEFAULT_WATERMARK,
  ID_CARD_GRID_SIZES_MM,
  ID_CARD_LAYOUT_ELEMENTS,
  SPONSOR_LIMIT_MAX,
  WATERMARK_COLOURS,
  WATERMARK_KINDS,
  WATERMARK_OPACITY_MAX,
  WATERMARK_OPACITY_MIN,
  type IdCardElementBold,
  type IdCardElementPosition,
  type IdCardElementPositions,
  type IdCardElementSizes,
  type IdCardElementTextSizes,
  type IdCardGridSizeMm,
  type IdCardLayoutElement,
  type IdCardLayoutFlags,
  type IdCardPrintSettings,
  type IdCardWatermark,
} from "./model";
import { clamp, elementBoxHeightMm, isTextElement, minimumElementSizeMm } from "./geometry";
import {
  defaultIdCardElementBold,
  defaultIdCardElementTextSizes,
  defaultIdCardPrintSettings,
  geometryWithOptionalDefaults,
} from "./defaults";

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
