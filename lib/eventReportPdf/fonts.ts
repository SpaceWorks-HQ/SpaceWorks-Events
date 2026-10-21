import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
import fontkit from "@pdf-lib/fontkit";
import { StandardFonts, type Color, type PDFDocument, type PDFFont } from "pdf-lib";
import { hex } from "./style";

// ---------- Fonts ----------

export type Fonts = { display: PDFFont; regular: PDFFont; bold: PDFFont; supports: (codePoint: number) => boolean };

const BRAND_DIR = path.join(process.cwd(), "public", "brand");
let fontBytes: Promise<{ regular: Buffer; semibold: Buffer; supports: (codePoint: number) => boolean } | null> | null = null;

/**
 * Unwraps a WOFF 1.0 file into the plain TrueType/OpenType font it holds.
 * fontkit reads WOFF directly but re-inflates tables while laying out text,
 * which makes every report many times slower than with the plain font.
 */
export function woffToSfnt(woff: Buffer): Buffer {
  if (woff.readUInt32BE(0) !== 0x774f4646) return woff; // not "wOFF": already a plain font
  const numTables = woff.readUInt16BE(12);
  const tables = Array.from({ length: numTables }, (_, index) => {
    const entry = 44 + index * 20;
    const offset = woff.readUInt32BE(entry + 4);
    const compressed = woff.readUInt32BE(entry + 8);
    const length = woff.readUInt32BE(entry + 12);
    const raw = woff.subarray(offset, offset + compressed);
    return { tag: woff.readUInt32BE(entry), checksum: woff.readUInt32BE(entry + 16), data: compressed === length ? raw : inflateSync(raw) };
  });
  const entrySelector = Math.floor(Math.log2(numTables));
  const header = Buffer.alloc(12 + 16 * numTables);
  header.writeUInt32BE(woff.readUInt32BE(4), 0); // sfnt flavour
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(2 ** entrySelector * 16, 6);
  header.writeUInt16BE(entrySelector, 8);
  header.writeUInt16BE(numTables * 16 - 2 ** entrySelector * 16, 10);
  const parts: Buffer[] = [header];
  let offset = header.length;
  tables.forEach((table, index) => {
    header.writeUInt32BE(table.tag, 12 + index * 16);
    header.writeUInt32BE(table.checksum, 16 + index * 16);
    header.writeUInt32BE(offset, 20 + index * 16);
    header.writeUInt32BE(table.data.length, 24 + index * 16);
    const padding = (4 - (table.data.length % 4)) % 4;
    parts.push(table.data, Buffer.alloc(padding));
    offset += table.data.length + padding;
  });
  return Buffer.concat(parts);
}

/** Reads the Gilroy faces once per process, with the characters both can draw. */
function loadFontBytes() {
  fontBytes ??= Promise.all([
    readFile(path.join(BRAND_DIR, "fonts", "Gilroy-Regular.woff")).then(woffToSfnt),
    readFile(path.join(BRAND_DIR, "fonts", "Gilroy-SemiBold.woff")).then(woffToSfnt),
  ])
    .then(([regular, semibold]) => {
      const sets = [regular, semibold].map((data) => new Set(fontkit.create(data).characterSet));
      return { regular, semibold, supports: (codePoint: number) => sets.every((set) => set.has(codePoint)) };
    })
    // Without the brand fonts the report still renders, in Helvetica.
    .catch(() => null);
  return fontBytes;
}

export async function embedFonts(pdf: PDFDocument): Promise<Fonts> {
  const bytes = await loadFontBytes();
  if (bytes) {
    pdf.registerFontkit(fontkit);
    const [regular, semibold] = await Promise.all([pdf.embedFont(bytes.regular), pdf.embedFont(bytes.semibold)]);
    return { display: semibold, regular, bold: semibold, supports: bytes.supports };
  }
  const [regular, bold] = await Promise.all([pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold)]);
  return { display: bold, regular, bold, supports: (codePoint) => codePoint >= 0x20 && codePoint <= 0x7e };
}

// ---------- Logo ----------

export type LogoArt = { width: number; height: number; paths: Array<{ d: string; color: Color }> };
const logoArt = new Map<string, Promise<LogoArt | null>>();

/** A Space Works master SVG (public/brand/logo) as filled paths pdf-lib can draw unaltered. */
export function loadLogo(name: "lockup-horizontal" | "symbol"): Promise<LogoArt | null> {
  let art = logoArt.get(name);
  if (!art) {
    art = readFile(path.join(BRAND_DIR, "logo", `${name}.svg`), "utf8")
      .then((svg) => {
        const [, width, height] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg) ?? [];
        const paths = [...svg.matchAll(/<path d="([^"]+)" fill="(#[0-9A-Fa-f]{6})"/g)].map(([, d, fill]) => ({ d: d!, color: hex(fill!) }));
        return width && height && paths.length ? { width: Number(width), height: Number(height), paths } : null;
      })
      .catch(() => null);
    logoArt.set(name, art);
  }
  return art;
}

const ASCII_FALLBACK: Record<string, string> = { "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "·": "-", "•": "-", " ": " " };

/** Keeps what the embedded fonts can draw: accents decompose to their base letter, anything else is dropped. */
export function cleaner(supports: Fonts["supports"]) {
  return (value: string) => {
    let out = "";
    for (const char of value.replace(/\s+/g, " ")) {
      const codePoint = char.codePointAt(0)!;
      if (supports(codePoint)) out += char;
      else if (ASCII_FALLBACK[char]) out += ASCII_FALLBACK[char];
      else out += [...char.normalize("NFKD")].filter((part) => supports(part.codePointAt(0)!)).join("");
    }
    return out.trim();
  };
}

