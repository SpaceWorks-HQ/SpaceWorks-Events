import { describe, expect, it } from "vitest";
import {
  CR80,
  DEFAULT_LAYOUT_FLAGS,
  estimateHeaderHeightMm,
  exportIdCardDesign,
  ID_CARD_LINE_HEIGHT,
  ID_CARD_PAPER_PRESETS,
  importIdCardDesign,
  isDefaultLayout,
  layoutForPaper,
  nameBlockHeightMm,
  normalizeIdCardPrintSettings,
  PT_TO_MM,
  sponsorStripHeightMm,
  symbolClearSpaceMm,
  type IdCardLayoutFlags,
} from "@/lib/idCardPrint";

const TEMPLATES = ["classic", "bold", "minimal"] as const;
type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const grow = (b: Box, by: number): Box => ({ x: b.x - by, y: b.y - by, w: b.w + 2 * by, h: b.h + 2 * by });

const papers = ID_CARD_PAPER_PRESETS.flatMap((preset) => [
  { id: preset.id, widthMm: preset.widthMm, heightMm: preset.heightMm },
  { id: `${preset.id} turned`, widthMm: preset.heightMm, heightMm: preset.widthMm },
]);

const ALL_ON: IdCardLayoutFlags = { showLogo: true, showEventLogo: true, showSymbol: true, showPhoto: true, showSponsors: true };

function boxes(template: (typeof TEMPLATES)[number], widthMm: number, heightMm: number, flags: IdCardLayoutFlags) {
  const { elementPositions: at, elementSizes: size, elementTextSizes: pt } = layoutForPaper(template, widthMm, heightMm, flags);
  const line = (points: number) => points * PT_TO_MM * ID_CARD_LINE_HEIGHT.body;
  const box = (element: keyof typeof at, h: number, w = size[element]): Box => ({ x: at[element].xMm, y: at[element].yMm, w, h });
  return {
    header: box("header", estimateHeaderHeightMm(template, pt.header, widthMm, heightMm)),
    name: box("name", nameBlockHeightMm(pt.name)),
    email: box("email", line(pt.email)),
    footer: box("footer", line(pt.footer)),
    qr: box("qr", size.qr + 2, size.qr + 2),
    logo: box("logo", size.logo, size.logo),
    eventLogo: box("eventLogo", size.eventLogo, size.eventLogo),
    symbol: box("symbol", size.symbol, size.symbol),
    photo: box("photo", size.photo, size.photo),
    sponsors: box("sponsors", sponsorStripHeightMm(widthMm, heightMm)),
  };
}

describe("badge layout with every optional item turned on", () => {
  for (const paper of papers) {
    for (const template of TEMPLATES) {
      it(`${template} on ${paper.id} keeps logos, photo and sponsors clear of each other`, () => {
        const b = boxes(template, paper.widthMm, paper.heightMm, ALL_ON);
        for (const [element, box] of Object.entries(b)) {
          expect(box.x, `${element} left`).toBeGreaterThanOrEqual(0);
          expect(box.y, `${element} top`).toBeGreaterThanOrEqual(0);
          expect(box.x + box.w, `${element} right`).toBeLessThanOrEqual(paper.widthMm + 0.01);
          expect(box.y + box.h, `${element} bottom`).toBeLessThanOrEqual(paper.heightMm + 0.01);
        }
        const pairs: Array<[keyof typeof b, keyof typeof b]> = [
          ["photo", "name"], ["photo", "header"], ["photo", "email"], ["photo", "qr"], ["photo", "sponsors"],
          ["eventLogo", "header"], ["eventLogo", "logo"], ["eventLogo", "name"],
          ["sponsors", "qr"], ["sponsors", "logo"], ["sponsors", "eventLogo"], ["sponsors", "footer"], ["sponsors", "symbol"], ["sponsors", "name"],
          ["symbol", "footer"], ["symbol", "qr"], ["name", "header"], ["name", "qr"],
        ];
        for (const [one, two] of pairs) expect(overlaps(b[one], b[two]), `${one} / ${two}`).toBe(false);
        // Brand clear space: a quarter of the symbol's height on every side.
        const clear = symbolClearSpaceMm(b.symbol.h);
        for (const other of ["footer", "qr", "sponsors", "logo"] as const) {
          expect(overlaps(grow(b.symbol, clear - 0.01), b[other]), `symbol clear space / ${other}`).toBe(false);
        }
      });
    }
  }

  it("still lays out the original items exactly as before when the new ones are off", () => {
    const off: IdCardLayoutFlags = { showLogo: true, showEventLogo: false, showSymbol: false, showPhoto: false, showSponsors: false };
    const layout = layoutForPaper("classic", 105, 148, off);
    expect(layout.elementPositions.header).toEqual({ xMm: 10, yMm: 10 });
    expect(layout.elementPositions.qr).toEqual({ xMm: 70, yMm: 113 });
    expect(layout.elementPositions.footer.xMm).toBe(10);
  });
});

describe("badge settings normalisation", () => {
  it("defaults new designs to colour with the Space Works symbol", () => {
    const settings = normalizeIdCardPrintSettings(null, "Open House", "Makers");
    expect(settings).toMatchObject({
      colorMode: "colour",
      backgroundColor: "white",
      accentColor: "event",
      textColor: "auto",
      showSymbol: true,
      showEventLogo: false,
      showPhoto: false,
      showSponsors: false,
      photoShape: "circle",
      sponsorLimit: 4,
      footerText: "Makers",
    });
    expect(isDefaultLayout(settings)).toBe(true);
  });

  it("keeps designs saved before colour existed in black and white with no new items", () => {
    const legacy = normalizeIdCardPrintSettings({ template: "bold", widthMm: 105, heightMm: 148, showLogo: true }, "Open House");
    expect(legacy).toMatchObject({ colorMode: "mono", showSymbol: false, showEventLogo: false, showPhoto: false, showSponsors: false, template: "bold" });
    expect(legacy.elementPositions.symbol).toBeDefined();
    expect(legacy.elementSizes.photo).toBeGreaterThanOrEqual(8);
  });

  it("rejects colours and shapes outside the brand set", () => {
    const settings = normalizeIdCardPrintSettings({
      colorMode: "neon",
      backgroundColor: "#ff00ff",
      accentColor: "purple",
      textColor: "orange",
      photoShape: "star",
      sponsorLimit: 99,
      showPhoto: "yes",
    }, "Open House");
    expect(settings).toMatchObject({ colorMode: "colour", backgroundColor: "white", accentColor: "event", textColor: "auto", photoShape: "circle", sponsorLimit: 6, showPhoto: false });
    expect(normalizeIdCardPrintSettings({ colorMode: "colour", sponsorLimit: -3 }, "x").sponsorLimit).toBe(1);
  });

  it("bounds new item sizes and keeps them on the card", () => {
    const settings = normalizeIdCardPrintSettings({
      colorMode: "colour",
      ...CR80,
      elementSizes: { photo: 1, symbol: 2, sponsors: 500 },
      elementPositions: { photo: { xMm: 500, yMm: 500 }, sponsors: { xMm: 80, yMm: 60 } },
      elementBold: { photo: true },
      elementTextSizes: { photo: 20 },
    }, "x");
    expect(settings.elementSizes.photo).toBe(8);
    expect(settings.elementSizes.symbol).toBe(7);
    expect(settings.elementSizes.sponsors).toBeLessThanOrEqual(CR80.widthMm - 4);
    expect(settings.elementPositions.photo.xMm + settings.elementSizes.photo).toBeLessThanOrEqual(CR80.widthMm);
    expect(settings.elementPositions.photo.yMm + settings.elementSizes.photo).toBeLessThanOrEqual(CR80.heightMm);
    expect(settings.elementPositions.sponsors.yMm + sponsorStripHeightMm(CR80.widthMm, CR80.heightMm)).toBeLessThanOrEqual(CR80.heightMm);
    expect(settings.elementBold.photo).toBe(false);
    expect(settings.elementTextSizes.photo).toBe(0);
  });

  it("round-trips new design files and still imports old Yuyu files", () => {
    const design = normalizeIdCardPrintSettings({ colorMode: "colour", backgroundColor: "ink", accentColor: "citron", showPhoto: true, photoShape: "rounded" }, "Open House");
    const file = exportIdCardDesign(design);
    expect(JSON.parse(file)).toMatchObject({ kind: "swe-id-card-design", version: 2 });
    expect(importIdCardDesign(file, "Open House")).toEqual(design);
    const old = JSON.stringify({ kind: "yuyu-id-card-design", version: 1, settings: { template: "minimal", heading: "Summit" } });
    expect(importIdCardDesign(old, "Open House")).toMatchObject({ template: "minimal", heading: "Summit", colorMode: "mono" });
    expect(importIdCardDesign(JSON.stringify({ kind: "something-else", settings: {} }), "Open House")).toBeNull();
  });

  it("recognises a hand-adjusted layout", () => {
    const settings = normalizeIdCardPrintSettings(null, "Open House");
    const moved = { ...settings, elementPositions: { ...settings.elementPositions, name: { xMm: 12, yMm: 50 } } };
    expect(isDefaultLayout(moved)).toBe(false);
    expect(isDefaultLayout(settings, { ...DEFAULT_LAYOUT_FLAGS, showPhoto: true })).toBe(false);
  });
});
