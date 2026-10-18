import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ downloadFile: vi.fn() }));
vi.mock("@/lib/storage", () => ({ downloadFile: mocks.downloadFile }));

import { CR80, normalizeIdCardPrintSettings } from "@/lib/idCardPrint";
import { MAX_PHOTO_PX, prepareBadgeImage } from "@/lib/badge/assets";
import { loadBadgeFonts } from "@/lib/badge/fonts";
import { buildBadgeScene, wrapText, type BadgeScene, type BadgeTextOp } from "@/lib/badge/layout";
import { renderBadge, renderBadgeBatch } from "@/lib/badge/render";
import { renderBadgeSvg } from "@/lib/badge/renderPng";
import { tryAcquireRenderSlot } from "@/lib/badge/renderSlot";
import { pixelSize } from "@/lib/badge/sheet";
import type { BadgeBranding, IdCardAttendee } from "@/lib/badge/types";

const ORG = "org_1";
const UUID = "123e4567-e89b-42d3-a456-426614174000";
const logoUrl = `/api/uploads/organisations/${ORG}/organisation-logos/${UUID}.webp`;
const sponsorUrl = `/api/uploads/organisations/${ORG}/event-sponsors/${UUID}.webp`;
const photoUrl = `/api/uploads/users/user_1/profile-images/${UUID}.webp`;

const attendee: IdCardAttendee = {
  rsvpId: "rsvp_1",
  displayName: "Priya Raman",
  email: "priya@example.test",
  checkInQrToken: "tk_test_token_123456",
  checkInDetails: [],
  registrationDetails: [{ key: "company", label: "Company", value: "Tech4Good" }],
  photoUrl: null,
};

const branding: BadgeBranding = { eventAccent: "#006E63", organisationLogoUrl: logoUrl, eventLogoUrl: null, sponsorLogoUrls: [sponsorUrl, sponsorUrl] };

let webp: Buffer;

beforeAll(async () => {
  webp = await sharp({ create: { width: 120, height: 60, channels: 4, background: "#FF7447" } }).webp().toBuffer();
});

beforeEach(() => {
  mocks.downloadFile.mockReset();
  mocks.downloadFile.mockImplementation(async () => ({ body: new Uint8Array(webp), contentType: "image/webp" }));
});

function colourSettings(extra: Record<string, unknown> = {}) {
  return normalizeIdCardPrintSettings({
    colorMode: "colour",
    ...CR80,
    template: "bold",
    backgroundColor: "cream",
    accentColor: "teal",
    showSponsors: true,
    showPhoto: true,
    printFieldKeys: ["registration:company"],
    ...extra,
  }, "Maker Summit", "Space Works");
}

describe("badge text layout", { timeout: 30_000 }, () => {
  it("wraps at spaces and breaks words that are too long on their own", () => {
    const measure = (value: string) => value.length;
    expect(wrapText("one two three", 7, measure)).toEqual(["one two", "three"]);
    expect(wrapText("abcdefghij", 4, measure)).toEqual(["abcd", "efgh", "ij"]);
    expect(wrapText("   ", 4, measure)).toEqual([]);
  });

  it("measures Gilroy from the brand web fonts and keeps text inside its box", async () => {
    const { measurer } = await loadBadgeFonts();
    expect(measurer.widthMm("Priya Raman", 700, 30)).toBeGreaterThan(measurer.widthMm("Priya Raman", 400, 30) * 0.9);
    expect(measurer.clean("Zoë 中文")).toContain("Zoë");
    const settings = colourSettings();
    const scene = buildBadgeScene({ settings, attendee: { ...attendee, displayName: "Alexandra Montgomery-Fitzgerald the Third" }, branding, measurer });
    const texts = scene.ops.filter((op): op is BadgeTextOp => op.kind === "text");
    const nameSize = texts.find((op) => op.text.startsWith("ALEXANDRA"))?.sizePt;
    const nameOps = texts.filter((op) => op.sizePt === nameSize);
    expect(nameOps.length).toBeGreaterThanOrEqual(1);
    for (const op of nameOps) {
      expect(op.x + measurer.widthMm(op.text, op.weight, op.sizePt, op.trackingEm)).toBeLessThanOrEqual(settings.elementPositions.name.xMm + settings.elementSizes.name + 0.01);
    }
  });

  it("draws the band in the accent colour with readable text, a photo placeholder and the symbol", async () => {
    const { measurer } = await loadBadgeFonts();
    const scene = buildBadgeScene({ settings: colourSettings(), attendee, branding, measurer });
    expect(scene.background).toBe("#FFF4E8");
    expect(scene.ops).toContainEqual(expect.objectContaining({ kind: "rect", fill: "#006E63" }));
    expect(scene.ops).toContainEqual(expect.objectContaining({ kind: "text", text: "PR" }));
    expect(scene.ops).toContainEqual(expect.objectContaining({ kind: "symbol", variant: "full" }));
    expect(scene.ops.filter((op) => op.kind === "image" && op.url === sponsorUrl)).toHaveLength(2);
    const qr = scene.ops.find((op) => op.kind === "qr");
    expect(qr).toMatchObject({ value: attendee.checkInQrToken, dark: "#142C2A", light: "#FFFFFF" });
  });

  it("prints black on white in print-economy mode, with the ink symbol and grey images", async () => {
    const { measurer } = await loadBadgeFonts();
    const scene = buildBadgeScene({ settings: colourSettings({ colorMode: "mono" }), attendee: { ...attendee, photoUrl }, branding, measurer });
    expect(scene.background).toBe("#FFFFFF");
    for (const op of scene.ops) {
      if (op.kind === "text") expect(["#000000", "#FFFFFF"]).toContain(op.color);
      if (op.kind === "image") expect(op.grayscale).toBe(true);
    }
    expect(scene.ops).toContainEqual(expect.objectContaining({ kind: "symbol", variant: "ink" }));
  });
});

describe("badge PDF and PNG output", { timeout: 60_000 }, () => {
  it("renders one card as a single-page PDF at card size", async () => {
    const pdf = await renderBadge({ settings: colourSettings(), attendee: { ...attendee, photoUrl }, branding, format: "pdf", title: "Badge" });
    expect(Buffer.from(pdf.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo((85.6 / 25.4) * 72, 1);
    expect(height).toBeCloseTo((54 / 25.4) * 72, 1);
    // Logos and photo are read through the storage layer only.
    expect(mocks.downloadFile).toHaveBeenCalled();
    for (const [key] of mocks.downloadFile.mock.calls) expect(String(key)).toMatch(/^(organisations|users)\//);
  });

  it("renders a CR80 PNG at 300 dpi (1011 × 638 px) with text as outlines", async () => {
    const png = await renderBadge({ settings: colourSettings(), attendee, branding, format: "png", title: "Badge" }) as Buffer;
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe("png");
    expect([meta.width, meta.height]).toEqual([1011, 638]);
    expect(pixelSize(85.6, 53.98)).toEqual({ width: 1011, height: 638 });
    expect(meta.density).toBe(300);
    const { measurer } = await loadBadgeFonts();
    const { svg } = await renderBadgeSvg(buildBadgeScene({ settings: colourSettings(), attendee, branding, measurer }));
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain(attendee.displayName);
  });

  it("skips artwork that is not a managed upload, without fetching it", async () => {
    const remote = { ...branding, organisationLogoUrl: "https://evil.example/logo.png", sponsorLogoUrls: ["http://169.254.169.254/latest"] };
    const png = await renderBadge({ settings: colourSettings(), attendee: { ...attendee, photoUrl: "https://lh3.googleusercontent.com/a" }, branding: remote, format: "png", title: "Badge" });
    expect((await sharp(png as Buffer).metadata()).width).toBe(1011);
    expect(mocks.downloadFile).not.toHaveBeenCalled();
  });

  it("lays out a bulk PDF as one card per page or ten CR80 cards per A4 sheet", async () => {
    const people = Array.from({ length: 12 }, (_, index) => ({ ...attendee, rsvpId: `r${index}`, displayName: `Person ${index}`, checkInQrToken: `token-${index}-abcdefgh` }));
    const cards = await PDFDocument.load(await renderBadgeBatch({ settings: colourSettings(), attendees: people, branding, layout: "card", title: "Badges" }));
    expect(cards.getPageCount()).toBe(12);
    const sheets = await PDFDocument.load(await renderBadgeBatch({ settings: colourSettings(), attendees: people, branding, layout: "a4", title: "Badges" }));
    expect(sheets.getPageCount()).toBe(2);
    const { width, height } = sheets.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("keeps every drawing inside the card", async () => {
    const { measurer } = await loadBadgeFonts();
    const scene: BadgeScene = buildBadgeScene({ settings: colourSettings({ showEventLogo: true }), attendee, branding: { ...branding, eventLogoUrl: logoUrl }, measurer });
    for (const op of scene.ops) {
      if (op.kind === "text") continue;
      const w = op.kind === "qr" ? op.size : op.w;
      const h = op.kind === "qr" ? op.size : op.h;
      expect(op.x + w, op.kind).toBeLessThanOrEqual(scene.widthMm + 0.01);
      expect(op.y + h, op.kind).toBeLessThanOrEqual(scene.heightMm + 0.01);
    }
  });
});

describe("bulk render memory", { timeout: 60_000 }, () => {
  it("reads shared artwork once per render but each person's photo every time", async () => {
    const people = Array.from({ length: 3 }, (_, index) => ({ ...attendee, rsvpId: `p${index}`, checkInQrToken: `token-${index}-abcdefgh`, photoUrl }));
    await renderBadgeBatch({ settings: colourSettings(), attendees: people, branding, layout: "card", title: "Badges" });
    const reads = (part: string) => mocks.downloadFile.mock.calls.filter(([key]) => String(key).includes(part)).length;
    expect(reads("organisation-logos")).toBe(1);
    expect(reads("event-sponsors")).toBe(1);
    expect(reads("profile-images")).toBe(3);
  });

  it("caps photo rasters at 600 px however large the box", async () => {
    const large = await sharp({ create: { width: 2400, height: 2400, channels: 3, background: "#006E63" } }).webp().toBuffer();
    mocks.downloadFile.mockImplementation(async () => ({ body: new Uint8Array(large), contentType: "image/webp" }));
    const photo = await prepareBadgeImage(photoUrl, { wMm: 120, hMm: 120, fit: "cover", shape: "circle", grayscale: false, background: "#FFFFFF" });
    expect(photo).toMatchObject({ widthPx: MAX_PHOTO_PX, heightPx: MAX_PHOTO_PX });
    expect((await sharp(photo!.data).metadata()).width).toBe(600);
  });

  it("lets only one bulk render run at a time across routes", () => {
    const release = tryAcquireRenderSlot();
    expect(release).toBeTypeOf("function");
    expect(tryAcquireRenderSlot()).toBeNull();
    release!();
    release!();
    const again = tryAcquireRenderSlot();
    expect(again).toBeTypeOf("function");
    expect(tryAcquireRenderSlot()).toBeNull();
    again!();
  });
});
