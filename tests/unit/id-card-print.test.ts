import { describe, expect, it } from "vitest";
import {
  A6_LANDSCAPE,
  A6_PORTRAIT,
  badgeLabelPt,
  estimateHeaderHeightMm,
  ID_CARD_LINE_HEIGHT,
  ID_CARD_PAPER_PRESETS,
  idCardTemplateDecor,
  layoutForPaper,
  nameBlockHeightMm,
  normalizeIdCardPrintSettings,
  PT_TO_MM,
} from "@/lib/idCardPrint";

describe("ID card print settings", () => {
  it("defaults to A6 portrait and the event title", () => {
    expect(normalizeIdCardPrintSettings(null, "Open House")).toMatchObject({
      ...A6_PORTRAIT,
      heading: "Open House",
      badgeLabel: "ATTENDEE",
      showEmail: true,
      template: "classic",
      footerText: "Event check-in",
      showLogo: true,
      printFieldKeys: [],
      printFieldLabels: {},
      elementPositions: {
        header: { xMm: 10, yMm: 10 },
        qr: { xMm: 70, yMm: 113 },
      },
      gridSizeMm: 5,
      showGrid: true,
    });
  });

  it("keeps valid customisation while bounding paper dimensions", () => {
    expect(normalizeIdCardPrintSettings({
      ...A6_LANDSCAPE,
      heading: "  Welcome  ",
      badgeLabel: "Speaker",
      showEmail: false,
      template: "bold",
      footerText: "Door team",
      showLogo: false,
      printFieldKeys: ["registration:role", "registration:food"],
      printFieldLabels: { "registration:role": "Event role" },
      elementPositions: {
        name: { xMm: 15, yMm: 20 },
        qr: { xMm: 999, yMm: -1 },
      },
      elementSizes: { name: 70, qr: 30 },
      elementBold: { name: false },
      elementTextSizes: { header: 55, name: 4, email: 11 },
      gridSizeMm: 2,
      showGrid: false,
    }, "Open House")).toMatchObject({
      ...A6_LANDSCAPE,
      heading: "Welcome",
      badgeLabel: "Speaker",
      showEmail: false,
      template: "bold",
      footerText: "Door team",
      showLogo: false,
      printFieldKeys: ["registration:role", "registration:food"],
      printFieldLabels: { "registration:role": "Event role" },
      elementPositions: {
        name: { xMm: 15, yMm: 20 },
        qr: { xMm: 114, yMm: 0 },
      },
      elementSizes: { name: 70, qr: 30 },
      elementBold: { name: false },
      elementTextSizes: { header: 48, name: 6, email: 11 },
      gridSizeMm: 2,
      showGrid: false,
    });
    expect(normalizeIdCardPrintSettings({ widthMm: 2, heightMm: 1000 }, "Open House")).toMatchObject({
      widthMm: 40,
      heightMm: 300,
    });
    expect(normalizeIdCardPrintSettings({ printFieldKeys: ["system:organisation-name"] }, "Open House")).toMatchObject({
      printFieldKeys: [],
    });
    expect(normalizeIdCardPrintSettings({ printFieldLabels: { "registration:role": "   " } }, "Open House")).toMatchObject({
      printFieldLabels: { "registration:role": "" },
    });
  });
});

describe("ID card layout on real badge stock", () => {
  it("shrinks long names to fit one line, but never below 60%", async () => {
    const { fitTextSizePt } = await import("@/lib/idCardPrint");
    expect(fitTextSizePt("Priya Raman", 87, 16, true)).toBe(16);
    const long = fitTextSizePt("Alexandra Montgomery-Fitzgerald", 87, 16, true);
    expect(long).toBeLessThan(16);
    expect(long).toBeGreaterThanOrEqual(9.6);
    expect(fitTextSizePt("x".repeat(200), 87, 16, true)).toBe(9.6);
  });

  it("keeps every item on a CR80 card, with the QR still scannable", async () => {
    const { layoutForPaper } = await import("@/lib/idCardPrint");
    for (const template of ["classic", "bold", "minimal"] as const) {
      const layout = layoutForPaper(template, 85.6, 53.98);
      for (const [element, at] of Object.entries(layout.elementPositions)) {
        expect(at.xMm, `${template} ${element} x`).toBeLessThan(85.6);
        expect(at.yMm, `${template} ${element} y`).toBeLessThan(53.98);
      }
      expect(layout.elementSizes.qr).toBeGreaterThanOrEqual(16);
      expect(layout.elementPositions.qr.yMm + layout.elementSizes.qr).toBeLessThanOrEqual(53.98);
      expect(layout.elementTextSizes.name).toBeLessThan(16);
    }
  });

  it("recognises presets either way round", async () => {
    const { matchPaperPreset } = await import("@/lib/idCardPrint");
    expect(matchPaperPreset(85.6, 53.98)?.preset.id).toBe("cr80");
    expect(matchPaperPreset(148, 105)).toMatchObject({ preset: { id: "a6" }, rotated: true });
    expect(matchPaperPreset(90, 60)).toBeNull();
  });

  it("exports and imports designs, rejecting anything else", async () => {
    const { exportIdCardDesign, importIdCardDesign } = await import("@/lib/idCardPrint");
    const design = normalizeIdCardPrintSettings({ template: "bold", heading: "Summit", nameAutoFit: false }, "Open House");
    expect(importIdCardDesign(exportIdCardDesign(design), "Open House")).toEqual(design);
    expect(importIdCardDesign('{"settings":{}}', "Open House")).toBeNull();
    expect(importIdCardDesign("not json", "Open House")).toBeNull();
    // Old saved designs without the new options get the defaults.
    expect(normalizeIdCardPrintSettings({ template: "classic" }, "Open House")).toMatchObject({ nameAutoFit: true, showBadgeLabel: true, showFooter: true });
  });
});

const TEMPLATES = ["classic", "bold", "minimal"] as const;
type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Every preset, both ways round. */
const papers = ID_CARD_PAPER_PRESETS.flatMap((preset) => [
  { id: preset.id, widthMm: preset.widthMm, heightMm: preset.heightMm },
  { id: `${preset.id} turned`, widthMm: preset.heightMm, heightMm: preset.widthMm },
]);

/** Estimated boxes of the default layout: one line of heading and footer, one answer row, a two-line name. */
function defaultBoxes(template: (typeof TEMPLATES)[number], widthMm: number, heightMm: number) {
  const { elementPositions: at, elementSizes: size, elementTextSizes: pt } = layoutForPaper(template, widthMm, heightMm);
  const line = (points: number) => points * PT_TO_MM * ID_CARD_LINE_HEIGHT.body;
  const box = (element: keyof typeof at, h: number, w = size[element]): Box => ({ x: at[element].xMm, y: at[element].yMm, w, h });
  return {
    pt,
    boxes: {
      header: box("header", estimateHeaderHeightMm(template, pt.header, widthMm, heightMm)),
      name: box("name", nameBlockHeightMm(pt.name)),
      email: box("email", line(pt.email)),
      details: box("details", 1.5 + line(pt.details)),
      footer: box("footer", line(pt.footer)),
      // The QR and logo blocks include their white padding.
      qr: box("qr", size.qr + 2, size.qr + 2),
      logo: box("logo", size.logo, size.logo),
    },
  };
}

describe("ID card templates on every badge stock", () => {
  for (const paper of papers) {
    for (const template of TEMPLATES) {
      it(`${template} on ${paper.id} keeps every item on the card without collisions`, () => {
        const { widthMm, heightMm } = paper;
        const { boxes, pt } = defaultBoxes(template, widthMm, heightMm);
        for (const [element, b] of Object.entries(boxes)) {
          expect(b.x, `${element} left`).toBeGreaterThanOrEqual(0);
          expect(b.y, `${element} top`).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w, `${element} right`).toBeLessThanOrEqual(widthMm);
          expect(b.y + b.h, `${element} bottom`).toBeLessThanOrEqual(heightMm);
        }
        expect(overlaps(boxes.name, boxes.header), "name / heading").toBe(false);
        expect(overlaps(boxes.name, boxes.qr), "name / QR").toBe(false);
        expect(overlaps(boxes.name, boxes.logo), "name / logo").toBe(false);
        expect(overlaps(boxes.name, boxes.email), "name / email").toBe(false);
        expect(overlaps(boxes.header, boxes.logo), "heading / logo").toBe(false);
        expect(overlaps(boxes.footer, boxes.qr), "footer / QR").toBe(false);
        expect(overlaps(boxes.footer, boxes.logo), "footer / logo").toBe(false);
        expect(overlaps(boxes.details, boxes.qr), "answers / QR").toBe(false);
        // The name is read from a distance: it is always the largest type.
        for (const element of ["header", "email", "details", "footer"] as const) {
          expect(pt.name, `name larger than ${element}`).toBeGreaterThan(pt[element]);
        }
        expect(pt.name).toBeGreaterThan(badgeLabelPt(pt.header));
      });
    }
  }

  it("keeps the QR at least 20 mm on A6", () => {
    for (const template of TEMPLATES) {
      for (const [w, h] of [[105, 148], [148, 105]]) {
        expect(layoutForPaper(template, w, h).elementSizes.qr, template).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("survives normalisation unchanged, so a fresh layout is exactly what prints", () => {
    for (const paper of papers) {
      for (const template of TEMPLATES) {
        const layout = layoutForPaper(template, paper.widthMm, paper.heightMm);
        const normalised = normalizeIdCardPrintSettings({ ...paper, template, ...layout }, "Open House");
        expect(normalised.elementPositions, `${template} ${paper.id}`).toEqual(layout.elementPositions);
        expect(normalised.elementSizes, `${template} ${paper.id}`).toEqual(layout.elementSizes);
        expect(normalised.elementTextSizes, `${template} ${paper.id}`).toEqual(layout.elementTextSizes);
      }
    }
  });

  it("still accepts designs saved with the earlier templates", () => {
    const saved = {
      ...A6_PORTRAIT,
      template: "bold",
      elementPositions: {
        header: { xMm: 16, yMm: 9 }, name: { xMm: 16, yMm: 45 }, email: { xMm: 16, yMm: 57 }, details: { xMm: 16, yMm: 68 },
        qr: { xMm: 73, yMm: 8 }, footer: { xMm: 16, yMm: 139 }, logo: { xMm: 81, yMm: 120 },
      },
      elementSizes: { header: 65, name: 49, email: 49, details: 49, qr: 22, footer: 80, logo: 13 },
      elementTextSizes: { header: 28, name: 17, email: 10, details: 8.5, footer: 8 },
    };
    const normalised = normalizeIdCardPrintSettings(saved, "Open House");
    expect(normalised.template).toBe("bold");
    expect(normalised.elementPositions).toEqual(saved.elementPositions);
    expect(normalised.elementSizes).toMatchObject(saved.elementSizes);
    expect(normalised.elementTextSizes).toMatchObject(saved.elementTextSizes);
  });

  it("draws the bold heading on a black band and the classic one under a hairline", () => {
    const bold = idCardTemplateDecor("bold", 105, 148);
    expect(bold.band).not.toBeNull();
    expect(bold.frame).toBeNull();
    expect(bold.nameUppercase).toBe(true);
    const classic = idCardTemplateDecor("classic", 105, 148);
    expect(classic.headerRule).not.toBeNull();
    expect(classic.frame?.insetMm).toBeGreaterThanOrEqual(4);
    const minimal = idCardTemplateDecor("minimal", 105, 148);
    expect([minimal.band, minimal.frame, minimal.headerRule]).toEqual([null, null, null]);
  });
});
