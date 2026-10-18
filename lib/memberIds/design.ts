import {
  CR80,
  DEFAULT_WATERMARK,
  ID_CARD_LINE_HEIGHT,
  layoutForPaper,
  normalizeIdCardPrintSettings,
  PT_TO_MM,
  type IdCardLayoutFlags,
  type IdCardPrintSettings,
} from "@/lib/idCardPrint";

/*
 * Member ID card design: a front and a back, each an ordinary badge design
 * (lib/idCardPrint.ts) so the same canvas, PDF and PNG renderers draw them.
 * Custom fields are placed on a side by the programme's field settings, not
 * by the design, so the form builder stays the single source of truth.
 */

export const MEMBER_ID_PRESETS = ["community", "corporate", "event", "student"] as const;
export type MemberIdPreset = (typeof MEMBER_ID_PRESETS)[number];
export type MemberIdSide = "front" | "back";

export const MEMBER_ID_PRESET_INFO: Record<MemberIdPreset, { label: string; hint: string }> = {
  community: { label: "Community", hint: "Warm Cream with a teal frame, landscape" },
  corporate: { label: "Corporate", hint: "White with a Deep Ink band, portrait" },
  event: { label: "Event pass", hint: "Deep Ink with a Citron band, portrait" },
  student: { label: "Student", hint: "White with a Sky Blue band, landscape" },
};

export type MemberIdDesign = {
  version: 1;
  preset: MemberIdPreset;
  /** Print and show the back. When off, downloads are front-only. */
  backEnabled: boolean;
  front: IdCardPrintSettings;
  back: IdCardPrintSettings;
};

export type MemberIdDesignContext = { programmeName: string; organisationName: string };

/** Upper bound for a stored design (front + back), in bytes of JSON. */
export const MEMBER_ID_DESIGN_MAX_BYTES = 64_000;

// Saved sizes are kept to 0.1 mm, so CR80's 53.98 mm is stored as 54.
const round1 = (mm: number) => Math.round(mm * 10) / 10;
const LANDSCAPE = { widthMm: round1(CR80.widthMm), heightMm: round1(CR80.heightMm) };
const PORTRAIT = { widthMm: round1(CR80.heightMm), heightMm: round1(CR80.widthMm) };

type PresetLook = Pick<IdCardPrintSettings, "template" | "backgroundColor" | "accentColor" | "textColor" | "widthMm" | "heightMm" | "photoShape">;

const LOOKS: Record<MemberIdPreset, PresetLook> = {
  community: { template: "classic", backgroundColor: "cream", accentColor: "teal", textColor: "auto", photoShape: "rounded", ...LANDSCAPE },
  corporate: { template: "bold", backgroundColor: "white", accentColor: "ink", textColor: "auto", photoShape: "circle", ...PORTRAIT },
  event: { template: "bold", backgroundColor: "ink", accentColor: "citron", textColor: "auto", photoShape: "rounded", ...PORTRAIT },
  student: { template: "bold", backgroundColor: "white", accentColor: "sky", textColor: "auto", photoShape: "rounded", ...LANDSCAPE },
};

const BADGE_LABELS: Record<MemberIdPreset, string> = { community: "MEMBER", corporate: "STAFF", event: "ACCESS PASS", student: "STUDENT" };

function side(preset: MemberIdPreset, which: MemberIdSide, context: MemberIdDesignContext): IdCardPrintSettings {
  const look = LOOKS[preset];
  const front = which === "front";
  const flags: IdCardLayoutFlags = {
    showLogo: true,
    showEventLogo: false,
    showSymbol: !front,
    showPhoto: front,
    showSponsors: false,
    showIdNumber: true,
    showValidUntil: front,
  };
  const base = normalizeIdCardPrintSettings({ colorMode: "colour" }, context.programmeName, context.organisationName);
  const layout = layoutForPaper(look.template, look.widthMm, look.heightMm, flags);
  if (!front) {
    // The back's note runs to two or three lines: lift it (and a symbol stacked above it) clear of the edge.
    const lineMm = layout.elementTextSizes.footer * PT_TO_MM * ID_CARD_LINE_HEIGHT.body;
    const lift = Math.round(lineMm * (look.widthMm > look.heightMm ? 1 : 2) * 10) / 10;
    const at = layout.elementPositions;
    const symbolAbove = at.symbol.yMm < at.footer.yMm - 1;
    at.footer = { ...at.footer, yMm: Math.round((at.footer.yMm - lift) * 10) / 10 };
    if (symbolAbove) at.symbol = { ...at.symbol, yMm: Math.round((at.symbol.yMm - lift) * 10) / 10 };
  }
  return {
    ...base,
    ...look,
    ...layout,
    heading: front ? (context.organisationName || context.programmeName) : context.programmeName,
    badgeLabel: front ? BADGE_LABELS[preset] : "ABOUT THIS CARD",
    showBadgeLabel: true,
    showEmail: false,
    showFooter: !front,
    footerText: front
      ? context.organisationName
      : `Issued by ${context.organisationName || "the organisation named on the front"}. Scan the front to check this card.`.slice(0, 240),
    nameAutoFit: true,
    showGrid: true,
    gridSizeMm: 1,
    ...flags,
    showIdNumber: true,
    showValidUntil: front,
    showName: front,
    showQr: front,
    printFieldKeys: [],
    printFieldLabels: {},
    watermark: { ...DEFAULT_WATERMARK },
  } as IdCardPrintSettings;
}

export function defaultMemberIdDesign(context: MemberIdDesignContext, preset: MemberIdPreset = "community"): MemberIdDesign {
  return {
    version: 1,
    preset,
    backEnabled: true,
    front: side(preset, "front", context),
    back: side(preset, "back", context),
  };
}

/** A fresh front and back for `preset`, keeping the existing watermark choices. */
export function applyMemberIdPreset(design: MemberIdDesign, preset: MemberIdPreset, context: MemberIdDesignContext): MemberIdDesign {
  const next = defaultMemberIdDesign(context, preset);
  return {
    ...next,
    backEnabled: design.backEnabled,
    front: { ...next.front, watermark: design.front.watermark },
    back: { ...next.back, watermark: design.back.watermark },
  };
}

function normaliseSide(value: unknown, fallback: IdCardPrintSettings, context: MemberIdDesignContext) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  // Always treated as a current design (colour fields present), never as a legacy event badge.
  return normalizeIdCardPrintSettings({ colorMode: "colour", ...(value as Record<string, unknown>) }, context.programmeName, context.organisationName);
}

/** Make a stored or submitted design safe to use. Anything unexpected falls back to the preset's default. */
export function normalizeMemberIdDesign(value: unknown, context: MemberIdDesignContext): MemberIdDesign {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const preset = (MEMBER_ID_PRESETS as readonly string[]).includes(input.preset as string) ? (input.preset as MemberIdPreset) : "community";
  const fallback = defaultMemberIdDesign(context, preset);
  return {
    version: 1,
    preset,
    backEnabled: typeof input.backEnabled === "boolean" ? input.backEnabled : true,
    front: normaliseSide(input.front, fallback.front, context),
    back: normaliseSide(input.back, fallback.back, context),
  };
}

export type PlacedField = { key: string; label: string; placement: "FRONT" | "BACK" | "HIDDEN" };

export const memberFieldKey = (key: string) => `registration:${key}`;

/**
 * The settings to draw one side: the design for that side plus the custom
 * fields placed there, in form order.
 */
export function sideSettings(design: MemberIdDesign, which: MemberIdSide, fields: PlacedField[]): IdCardPrintSettings {
  const settings = design[which];
  const placement = which === "front" ? "FRONT" : "BACK";
  const placed = fields.filter((field) => field.placement === placement);
  return {
    ...settings,
    printFieldKeys: placed.map((field) => memberFieldKey(field.key)),
    printFieldLabels: Object.fromEntries(placed.map((field) => [memberFieldKey(field.key), field.label.slice(0, 60)])),
  };
}
