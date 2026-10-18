import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ downloadFile: vi.fn() }));
vi.mock("@/lib/storage", () => ({ downloadFile: mocks.downloadFile }));

import { loadBadgeFonts } from "@/lib/badge/fonts";
import { buildBadgeScene, type BadgeTextOp } from "@/lib/badge/layout";
import { renderBadgeSvg } from "@/lib/badge/renderPng";
import type { BadgeBranding, IdCardAttendee } from "@/lib/badge/types";
import { normalizeIdCardPrintSettings, watermarkSizePt } from "@/lib/idCardPrint";
import { cardState, computeExpiry, deriveIdPrefix, formatIdNumber, memberDetails, parseDateInput, validateFieldValues, type ProgrammeFieldDef } from "@/lib/memberIds/core";
import { applyMemberIdPreset, defaultMemberIdDesign, MEMBER_ID_PRESETS, normalizeMemberIdDesign, sideSettings } from "@/lib/memberIds/design";
import { autoMap, googleSheetCsvUrl, parseCsv, planImport, toImportTable } from "@/lib/memberIds/importRows";
import { memberCardScenes, renderMemberCard, renderMemberCardsZip } from "@/lib/memberIds/render";
import { verificationView } from "@/lib/memberIds/verify";
import { createZip, readZip } from "@/lib/memberIds/zip";

const context = { programmeName: "Community members 2026", organisationName: "Space Works" };
const ORG = "org_1";
const UUID = "123e4567-e89b-42d3-a456-426614174000";
const photoUrl = `/api/uploads/organisations/${ORG}/member-id-photos/${UUID}.webp`;
const watermarkUrl = `/api/uploads/organisations/${ORG}/member-id-watermarks/${UUID}.webp`;
const branding: BadgeBranding = { eventAccent: null, organisationLogoUrl: null, eventLogoUrl: null, sponsorLogoUrls: [], watermarkUrl };

const person: IdCardAttendee = {
  displayName: "Priya Raman",
  email: "priya@example.test",
  checkInQrToken: "https://events.example.test/verify/AbCdEfGhIjKlMnOpQrStUv",
  checkInDetails: [],
  registrationDetails: [{ key: "role", label: "Role", value: "Volunteer lead" }, { key: "blood", label: "Blood group", value: "O+" }],
  photoUrl,
  idNumber: "SWK-2026-0042",
  validUntil: "31 Dec 2026",
};
const fields = [
  { key: "role", label: "Role", type: "TEXT" as const, placement: "FRONT" as const },
  { key: "blood", label: "Blood group", type: "TEXT" as const, placement: "BACK" as const },
];

let webp: Buffer;
beforeAll(async () => {
  webp = await sharp({ create: { width: 200, height: 200, channels: 4, background: "#006E63" } }).webp().toBuffer();
});
beforeEach(() => {
  mocks.downloadFile.mockReset();
  mocks.downloadFile.mockImplementation(async () => ({ body: new Uint8Array(webp), contentType: "image/webp" }));
});

describe("badge settings for member IDs", () => {
  it("keeps saved event badges unchanged: no ID items, name and QR on, no watermark", () => {
    const legacy = normalizeIdCardPrintSettings({ heading: "Maker Summit", template: "bold" }, "Maker Summit", "Space Works");
    expect(legacy).toMatchObject({ showName: true, showQr: true, showIdNumber: false, showValidUntil: false });
    expect(legacy.watermark.kind).toBe("none");
    const current = normalizeIdCardPrintSettings({ colorMode: "colour", template: "classic" }, "Maker Summit");
    expect(current.elementPositions.details).toEqual(normalizeIdCardPrintSettings({ colorMode: "colour" }, "Maker Summit").elementPositions.details);
  });

  it("bounds watermark settings and rejects unknown kinds", () => {
    const settings = normalizeIdCardPrintSettings({ colorMode: "colour", watermark: { kind: "video", text: "x".repeat(80), opacityPct: 90, colour: "orange", angleDeg: 400 } }, "T");
    expect(settings.watermark).toEqual({ kind: "none", text: "x".repeat(32), opacityPct: 30, colour: "accent", angleDeg: 90 });
    expect(normalizeIdCardPrintSettings({ colorMode: "colour", watermark: { kind: "text", text: "MEMBER", opacityPct: 1 } }, "T").watermark.opacityPct).toBe(4);
  });

  it("sizes a text watermark to the card", () => {
    const short = watermarkSizePt("VIP", 85.6, 54, -30);
    const long = watermarkSizePt("COMMUNITY MEMBER", 85.6, 54, -30);
    expect(short).toBeGreaterThan(long);
    expect(short * 0.3528).toBeLessThanOrEqual(54 * 0.4 + 0.1);
  });

  it("normalises a member ID design, front and back, with every preset", () => {
    for (const preset of MEMBER_ID_PRESETS) {
      const design = defaultMemberIdDesign(context, preset);
      expect(design.front.showPhoto).toBe(true);
      expect(design.front.showIdNumber && design.front.showValidUntil && design.front.showQr).toBe(true);
      expect(design.back.showName).toBe(false);
      expect([design.front.widthMm, design.front.heightMm]).toEqual([design.back.widthMm, design.back.heightMm]);
      expect(normalizeMemberIdDesign(JSON.parse(JSON.stringify(design)), context)).toEqual(design);
    }
    const junk = normalizeMemberIdDesign({ preset: "nope", backEnabled: "yes", front: "x", back: [] }, context);
    expect(junk.preset).toBe("community");
    expect(junk.backEnabled).toBe(true);
    const switched = applyMemberIdPreset({ ...junk, backEnabled: false, front: { ...junk.front, watermark: { kind: "text", text: "VIP", opacityPct: 12, colour: "text", angleDeg: -30 } } }, "event", context);
    expect(switched.preset).toBe("event");
    expect(switched.backEnabled).toBe(false);
    expect(switched.front.watermark.text).toBe("VIP");
  });

  it("puts each custom field on the side it is placed on", () => {
    const design = defaultMemberIdDesign(context);
    expect(sideSettings(design, "front", fields).printFieldKeys).toEqual(["registration:role"]);
    expect(sideSettings(design, "back", fields).printFieldKeys).toEqual(["registration:blood"]);
    expect(sideSettings(design, "back", [{ ...fields[1]!, placement: "HIDDEN" }]).printFieldKeys).toEqual([]);
  });
});

describe("member ID rules", () => {
  it("derives prefixes and formats ID numbers", () => {
    expect(deriveIdPrefix("Space Works")).toBe("SW");
    expect(deriveIdPrefix("Tinkerspace")).toBe("TIN");
    expect(deriveIdPrefix("Kerala Startup Mission Labs")).toBe("KSM");
    expect(deriveIdPrefix("!!")).toBe("ID");
    expect(formatIdNumber("SWK", 2026, 42)).toBe("SWK-2026-0042");
    expect(formatIdNumber("SWK", 2026, 12345)).toBe("SWK-2026-12345");
  });

  it("computes expiry from a fixed date, a number of days, or not at all", () => {
    const issued = new Date("2026-03-01T10:00:00Z");
    const fixed = new Date("2026-12-31T23:59:59Z");
    expect(computeExpiry({ validUntil: fixed, validityDays: 30 }, issued)).toEqual(fixed);
    expect(computeExpiry({ validUntil: null, validityDays: 30 }, issued)).toEqual(new Date("2026-03-31T10:00:00Z"));
    expect(computeExpiry({ validUntil: null, validityDays: null }, issued)).toBeNull();
    expect(parseDateInput("2026-02-30")).toBeNull();
    expect(parseDateInput("2026-12-31")?.toISOString()).toBe("2026-12-31T23:59:59.000Z");
  });

  it("knows each card's state", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    expect(cardState({ status: "APPROVED", expiresAt: null }, now)).toBe("valid");
    expect(cardState({ status: "APPROVED", expiresAt: new Date("2026-05-31T00:00:00Z") }, now)).toBe("expired");
    expect(cardState({ status: "REVOKED", expiresAt: null }, now)).toBe("revoked");
    expect(cardState({ status: "PENDING", expiresAt: null }, now)).toBe("pending");
    expect(cardState({ status: "REJECTED", expiresAt: null }, now)).toBe("rejected");
  });

  it("checks answers by type and drops unknown keys", () => {
    const defs: ProgrammeFieldDef[] = [
      { key: "role", label: "Role", type: "TEXT", required: true, options: [] },
      { key: "team", label: "Team", type: "SELECT", required: false, options: ["Red", "Blue"] },
      { key: "dob", label: "Date of birth", type: "DATE", required: false, options: [] },
      { key: "phone", label: "Phone", type: "PHONE", required: false, options: [] },
    ];
    expect(validateFieldValues(defs, {})).toEqual({ ok: false, error: "Role is required." });
    expect(validateFieldValues(defs, { role: "Lead", team: "Green" }).ok).toBe(false);
    expect(validateFieldValues(defs, { role: "Lead", phone: "call me" }).ok).toBe(false);
    expect(validateFieldValues(defs, { role: " Lead ", team: "Red", dob: "1998-02-14", evil: "x" })).toEqual({ ok: true, values: { role: "Lead", team: "Red", dob: "1998-02-14" } });
    expect(validateFieldValues(defs, {}, { enforceRequired: false })).toEqual({ ok: true, values: {} });
    expect(memberDetails(defs, { dob: "1998-02-14", role: "Lead" })).toEqual([{ key: "role", label: "Role", value: "Lead" }, { key: "dob", label: "Date of birth", value: "14 Feb 1998" }]);
  });
});

describe("public verify view", () => {
  const base = { name: "Priya Raman", idNumber: "SWK-2026-0042", photoUrl, programmeName: "Members", organisationName: "Space Works" };
  const now = new Date("2026-06-01T00:00:00Z");
  it("shows details only for valid and expired cards", () => {
    expect(verificationView({ ...base, status: "APPROVED", expiresAt: new Date("2026-12-31T00:00:00Z") }, now)).toMatchObject({ state: "valid", name: "Priya Raman", validUntil: "31 Dec 2026" });
    expect(verificationView({ ...base, status: "APPROVED", expiresAt: new Date("2026-01-01T00:00:00Z") }, now)).toMatchObject({ state: "expired", name: "Priya Raman" });
  });
  it("reveals nothing for revoked, pending, rejected or unknown cards", () => {
    expect(verificationView({ ...base, status: "REVOKED", expiresAt: null }, now)).toEqual({ state: "revoked" });
    expect(verificationView({ ...base, status: "PENDING", expiresAt: null }, now)).toEqual({ state: "not-found" });
    expect(verificationView({ ...base, status: "REJECTED", expiresAt: null }, now)).toEqual({ state: "not-found" });
    expect(verificationView(null, now)).toEqual({ state: "not-found" });
  });
});

describe("importing members", () => {
  it("parses quoted CSV with commas, quotes, CRLF and a BOM", () => {
    const rows = parseCsv('﻿Name,Email,Role\r\n"Raman, Priya",priya@x.test,"Says ""hi"""\r\n\r\nArun,arun@x.test,Lead\n');
    expect(rows).toEqual([["Name", "Email", "Role"], ["Raman, Priya", "priya@x.test", 'Says "hi"'], ["Arun", "arun@x.test", "Lead"]]);
    expect(parseCsv("a\nb\nc\nd", 2)).toHaveLength(2);
  });

  it("accepts only Google Sheets links and rebuilds the export URL", () => {
    const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
    expect(googleSheetCsvUrl(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=12`)).toBe(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=12`);
    expect(googleSheetCsvUrl(`https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing`)).toBe(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=0`);
    for (const bad of [
      `http://docs.google.com/spreadsheets/d/${id}/edit`,
      `https://docs.google.com.evil.test/spreadsheets/d/${id}/edit`,
      `https://evil.test/spreadsheets/d/${id}`,
      `https://user:pass@docs.google.com/spreadsheets/d/${id}`,
      `https://docs.google.com:8443/spreadsheets/d/${id}`,
      `https://docs.google.com/document/d/${id}/edit`,
      "https://docs.google.com/spreadsheets/d/short/edit",
      `https://docs.google.com/spreadsheets/d/${id}/edit?gid=1;DROP`,
      "javascript:alert(1)",
      "not a url",
      `https://docs.google.com/spreadsheets/d/${id}@169.254.169.254/`,
    ]) {
      expect(googleSheetCsvUrl(bad), bad).toBeNull();
    }
  });

  it("maps columns, skips bad rows and de-duplicates by email", () => {
    const table = toImportTable(parseCsv("Full name,E-mail,Role,Notes\nPriya,PRIYA@x.test,Lead,a\nPriya again,priya@x.test,Lead,b\nNo email,,Lead,c\n,anon@x.test,Lead,d\nArun,arun@x.test,Helper,e\nTaken,taken@x.test,,f"));
    const defs: ProgrammeFieldDef[] = [{ key: "role", label: "Role", type: "TEXT", required: true, options: [] }];
    const mapping = autoMap(table.headers, defs);
    expect(mapping).toEqual(["name", "email", "field:role", ""]);
    const plan = planImport(table, mapping, defs, new Set(["taken@x.test"]));
    expect(plan.members).toEqual([
      { name: "Priya", email: "priya@x.test", values: { role: "Lead" } },
      { name: "Arun", email: "arun@x.test", values: { role: "Helper" } },
    ]);
    expect(plan.duplicates).toBe(2);
    expect(plan.skipped).toEqual([{ row: 4, reason: "No valid email" }, { row: 5, reason: "No name" }]);
  });
});

describe("member ID cards", { timeout: 60_000 }, () => {
  it("draws the ID number, valid until, watermark and the right fields on each side", async () => {
    const { measurer } = await loadBadgeFonts();
    const design = defaultMemberIdDesign(context);
    design.front.watermark = { kind: "text", text: "Member", opacityPct: 10, colour: "accent", angleDeg: -30 };
    const front = buildBadgeScene({ settings: sideSettings(design, "front", fields), attendee: person, branding, measurer });
    const texts = front.ops.filter((op): op is BadgeTextOp => op.kind === "text");
    expect(texts.some((op) => op.text.includes("SWK-2026-0042"))).toBe(true);
    expect(texts.some((op) => op.text.includes("31 Dec 2026"))).toBe(true);
    expect(texts.find((op) => op.text === "MEMBER")).toMatchObject({ rotateDeg: -30, opacity: 0.1 });
    expect(front.ops[0]).toMatchObject({ kind: "text", text: "MEMBER" });
    expect(texts.some((op) => op.text.includes("Volunteer lead"))).toBe(true);
    expect(front.ops.find((op) => op.kind === "qr")).toMatchObject({ value: person.checkInQrToken });

    const back = buildBadgeScene({ settings: sideSettings({ ...design, back: { ...design.back, watermark: { kind: "image", text: "", opacityPct: 8, colour: "accent", angleDeg: 0 } } }, "back", fields), attendee: person, branding, measurer });
    const backTexts = back.ops.filter((op): op is BadgeTextOp => op.kind === "text").map((op) => op.text).join(" ");
    expect(backTexts).toContain("O+");
    expect(backTexts).not.toContain("Priya Raman");
    expect(back.ops.some((op) => op.kind === "qr")).toBe(false);
    expect(back.ops[0]).toMatchObject({ kind: "image", url: watermarkUrl, opacity: 0.08 });
  });

  it("renders a two-page PDF (front, back) and a front-only PDF when the back is off", async () => {
    const input = { design: defaultMemberIdDesign(context), fields, branding };
    const pdf = await renderMemberCard(input, person, "pdf", { title: "Card" });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize().width).toBeCloseTo((85.6 / 25.4) * 72, 1);
    const single = await renderMemberCard({ ...input, design: { ...input.design, backEnabled: false } }, person, "pdf", { title: "Card" });
    expect((await PDFDocument.load(single)).getPageCount()).toBe(1);
    for (const [key] of mocks.downloadFile.mock.calls) expect(String(key)).toMatch(/^organisations\/org_1\/member-id-/);
  });

  it("renders PNGs with rotated, translucent watermark text", async () => {
    const design = defaultMemberIdDesign(context, "event");
    design.front.watermark = { kind: "text", text: "VIP", opacityPct: 12, colour: "accent", angleDeg: -30 };
    const [front] = await memberCardScenes({ design, fields, branding }, person);
    const { svg } = await renderBadgeSvg(front!);
    expect(svg).toMatch(/fill-opacity="0.12" transform="rotate\(-30 /);
    const png = await renderMemberCard({ design, fields, branding }, person, "png", { title: "Card" });
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([638, 1011]);
  });

  it("zips one PDF per member", async () => {
    async function* people() {
      yield person;
      yield { ...person, displayName: "Arun K" };
      yield { ...person, displayName: "Meera S" };
    }
    const zip = await renderMemberCardsZip({ design: defaultMemberIdDesign(context), fields, branding }, people(), (p, i) => `${i}-${p.displayName}.pdf`);
    const entries = readZip(zip);
    expect(entries.map((entry) => entry.name)).toEqual(["1-Priya Raman.pdf", "2-Arun K.pdf", "3-Meera S.pdf"]);
    for (const entry of entries) expect((await PDFDocument.load(entry.data)).getPageCount()).toBe(2);
    expect(readZip(createZip([]))).toEqual([]);
  });

  it.skipIf(!process.env.MEMBER_ID_PREVIEW_DIR)("writes preset previews for manual review", async () => {
    for (const preset of MEMBER_ID_PRESETS) {
      for (const side of ["front", "back"] as const) {
        const png = await renderMemberCard({ design: defaultMemberIdDesign(context, preset), fields, branding: { ...branding, watermarkUrl: null } }, person, "png", { side, title: "x" });
        await writeFile(path.join(process.env.MEMBER_ID_PREVIEW_DIR!, `${preset}-${side}.png`), png);
      }
    }
  });
});
