import "server-only";

import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import path from "node:path";
import fontkit, { type Font } from "@pdf-lib/fontkit";
import { PT_TO_MM } from "@/lib/idCardPrint";
import type { FontWeight, TextMeasurer } from "./layout";

/*
 * Gilroy for badges, read from the brand web fonts (WOFF; fontkit decodes
 * them). The same faces measure text for layout, embed into PDFs (subset)
 * and give glyph outlines for PNGs, so no system fonts are involved.
 */

const FONT_DIR = path.join(process.cwd(), "public", "brand", "fonts");
const FILES: Record<FontWeight, string> = { 400: "Gilroy-Regular.woff", 600: "Gilroy-SemiBold.woff", 700: "Gilroy-Bold.woff" };
export const FONT_WEIGHTS: FontWeight[] = [400, 600, 700];

export type BadgeFonts = {
  bytes: Record<FontWeight, Uint8Array>;
  faces: Record<FontWeight, Font>;
  measurer: TextMeasurer;
};

const ASCII_FALLBACK: Record<string, string> = { "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "·": "-", "•": "-", " ": " " };

let loaded: Promise<BadgeFonts> | null = null;

/**
 * Unwrap a WOFF 1.0 file into the plain TrueType/OpenType font it contains,
 * using Node's zlib once at startup. Every PDF embeds the fonts, and parsing
 * plain tables is much faster than inflating WOFF tables in JavaScript each time.
 */
export function woffToSfnt(woff: Uint8Array): Uint8Array {
  const input = Buffer.from(woff.buffer, woff.byteOffset, woff.byteLength);
  if (input.toString("latin1", 0, 4) !== "wOFF") return woff;
  const flavor = input.readUInt32BE(4);
  const numTables = input.readUInt16BE(12);
  const tables = Array.from({ length: numTables }, (_, index) => {
    const entry = 44 + index * 20;
    const offset = input.readUInt32BE(entry + 4);
    const compLength = input.readUInt32BE(entry + 8);
    const origLength = input.readUInt32BE(entry + 12);
    const raw = input.subarray(offset, offset + compLength);
    return {
      tag: input.readUInt32BE(entry),
      checksum: input.readUInt32BE(entry + 16),
      data: compLength < origLength ? inflateSync(raw) : raw,
    };
  });
  let searchRange = 1;
  let entrySelector = 0;
  while (searchRange * 2 <= numTables) {
    searchRange *= 2;
    entrySelector += 1;
  }
  const headerLength = 12 + numTables * 16;
  const total = tables.reduce((sum, table) => sum + Math.ceil(table.data.length / 4) * 4, headerLength);
  const out = Buffer.alloc(total);
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(searchRange * 16, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(numTables * 16 - searchRange * 16, 10);
  let offset = headerLength;
  tables.forEach((table, index) => {
    const entry = 12 + index * 16;
    out.writeUInt32BE(table.tag, entry);
    out.writeUInt32BE(table.checksum, entry + 4);
    out.writeUInt32BE(offset, entry + 8);
    out.writeUInt32BE(table.data.length, entry + 12);
    table.data.copy(out, offset);
    offset += Math.ceil(table.data.length / 4) * 4;
  });
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

export function loadBadgeFonts(): Promise<BadgeFonts> {
  loaded ??= (async () => {
    const entries = await Promise.all(FONT_WEIGHTS.map(async (weight) => [weight, woffToSfnt(new Uint8Array(await readFile(path.join(FONT_DIR, FILES[weight]))))] as const));
    const bytes = Object.fromEntries(entries) as Record<FontWeight, Uint8Array>;
    const faces = Object.fromEntries(FONT_WEIGHTS.map((weight) => [weight, fontkit.create(bytes[weight])])) as Record<FontWeight, Font>;
    const regular = faces[400];
    // Text may use any face, so keep only characters every face can draw.
    const supports = (codePoint: number) => codePoint === 32 || FONT_WEIGHTS.every((weight) => faces[weight].hasGlyphForCodePoint(codePoint));
    const clean = (value: string) => {
      let out = "";
      for (const char of value.replace(/[\t\r\n]+/g, " ")) {
        const codePoint = char.codePointAt(0)!;
        if (supports(codePoint)) out += char;
        else if (ASCII_FALLBACK[char]) out += ASCII_FALLBACK[char];
        else out += [...char.normalize("NFKD")].filter((part) => supports(part.codePointAt(0)!)).join("");
      }
      return out;
    };
    const measurer: TextMeasurer = {
      widthMm(text, weight, sizePt, trackingEm = 0) {
        const face = faces[weight];
        const glyphs = face.glyphsForString(text);
        const units = glyphs.reduce((sum, glyph) => sum + glyph.advanceWidth, 0);
        const em = units / face.unitsPerEm + trackingEm * [...text].length;
        return em * sizePt * PT_TO_MM;
      },
      ascent: regular.ascent / regular.unitsPerEm,
      descent: Math.abs(regular.descent) / regular.unitsPerEm,
      clean,
    };
    return { bytes, faces, measurer };
  })().catch((error) => {
    loaded = null;
    throw error;
  });
  return loaded;
}
