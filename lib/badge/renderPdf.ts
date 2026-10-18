import "server-only";

import fontkit from "@pdf-lib/fontkit";
import { degrees, fill, PDFDocument, popGraphicsState, pushGraphicsState, rectangle, rgb, setCharacterSpacing, setFillingColor, type Color, type PDFEmbeddedPage, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { containBox, imageCache, loadSymbolPaths, qrModules, roundedRectPath, SYMBOL_VIEWBOX, type PreparedImage } from "./assets";
import { FONT_WEIGHTS, loadBadgeFonts } from "./fonts";
import type { BadgeScene, FontWeight } from "./layout";
import type { BadgeSymbolVariant } from "./palette";
import { cropMarks, mmToPt, PT_PER_MM, sheetLayout, sheetSlot } from "./sheet";

/*
 * Badges as PDF: one card per page at card size, or CR80-style sheets on A4
 * with crop marks. Text is real (subset Gilroy), QR codes and the symbol are
 * vectors, and shared artwork is embedded once per document.
 */

export type BadgePdfLayout = "card" | "a4";

function hex(value: string): Color {
  const n = Number.parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

type Context = {
  pdf: PDFDocument;
  fonts: Record<FontWeight, PDFFont>;
  images: Map<string, Promise<PDFImage | null>>;
  symbols: Map<BadgeSymbolVariant, Promise<PDFEmbeddedPage>>;
  prepare: ReturnType<typeof imageCache>;
};

/** The symbol drawn once per variant as a reusable form, so each badge adds one drawing instruction. */
function symbolForm(context: Context, variant: BadgeSymbolVariant) {
  let entry = context.symbols.get(variant);
  if (!entry) {
    entry = (async () => {
      const source = await PDFDocument.create();
      const page = source.addPage([SYMBOL_VIEWBOX.width, SYMBOL_VIEWBOX.height]);
      for (const symbolPath of await loadSymbolPaths(variant)) {
        page.drawSvgPath(symbolPath.d, { x: 0, y: SYMBOL_VIEWBOX.height, color: hex(symbolPath.fill) });
      }
      return context.pdf.embedPage(page);
    })();
    context.symbols.set(variant, entry);
  }
  return entry;
}

async function embedImage(context: Context, prepared: PreparedImage | null, cacheKey: string | null) {
  if (!prepared) return null;
  if (cacheKey === null) return prepared.format === "png" ? context.pdf.embedPng(prepared.data) : context.pdf.embedJpg(prepared.data);
  let entry = context.images.get(cacheKey);
  if (!entry) {
    entry = prepared.format === "png" ? context.pdf.embedPng(prepared.data) : context.pdf.embedJpg(prepared.data);
    context.images.set(cacheKey, entry);
  }
  return entry;
}

/** Draw one scene with its top-left corner at (`originXMm`, `originYMm`) on `page`. */
async function drawScene(context: Context, page: PDFPage, scene: BadgeScene, originXMm: number, originYMm: number) {
  const pageHeight = page.getHeight();
  const x = (mm: number) => mmToPt(originXMm + mm);
  const y = (mm: number) => pageHeight - mmToPt(originYMm + mm);
  const svg = (d: string, options: { fill?: string; stroke?: string; strokeWidth?: number }) =>
    page.drawSvgPath(d, {
      x: x(0),
      y: y(0),
      scale: PT_PER_MM,
      ...(options.fill ? { color: hex(options.fill) } : {}),
      ...(options.stroke ? { borderColor: hex(options.stroke), borderWidth: options.strokeWidth ?? 0.2 } : {}),
    });

  svg(roundedRectPath(0, 0, scene.widthMm, scene.heightMm, 0), { fill: scene.background });
  for (const op of scene.ops) {
    if (op.kind === "rect") {
      const d = roundedRectPath(op.x, op.y, op.w, op.h, op.radius);
      if (op.fill) svg(d, { fill: op.fill });
      // Strokes are centred on the path, as a CSS border inset by half its width would be.
      if (op.stroke) {
        const half = (op.strokeWidth ?? 0.2) / 2;
        svg(roundedRectPath(op.x + half, op.y + half, op.w - 2 * half, op.h - 2 * half, Math.max(0, op.radius - half)), { stroke: op.stroke, strokeWidth: op.strokeWidth });
      }
    } else if (op.kind === "text") {
      const tracking = op.trackingEm * op.sizePt;
      if (tracking) page.pushOperators(setCharacterSpacing(tracking));
      page.drawText(op.text, {
        x: x(op.x),
        y: y(op.baseline),
        size: op.sizePt,
        font: context.fonts[op.weight],
        color: hex(op.color),
        // PDF space turns anticlockwise; the scene's angle is clockwise on the page.
        ...(op.rotateDeg ? { rotate: degrees(-op.rotateDeg) } : {}),
        ...(op.opacity !== undefined ? { opacity: op.opacity } : {}),
      });
      if (tracking) page.pushOperators(setCharacterSpacing(0));
    } else if (op.kind === "image") {
      const box = { wMm: op.w, hMm: op.h, fit: op.fit, shape: op.shape, grayscale: op.grayscale, background: scene.background };
      const prepared = await context.prepare(op.url, box, !op.photo);
      const image = await embedImage(context, prepared, op.photo ? null : JSON.stringify([op.url, box]));
      if (!image || !prepared) continue;
      const at = op.fit === "cover" ? { x: op.x, y: op.y, w: op.w, h: op.h } : containBox(op, prepared.widthPx, prepared.heightPx);
      page.drawImage(image, { x: x(at.x), y: y(at.y + at.h), width: mmToPt(at.w), height: mmToPt(at.h), ...(op.opacity !== undefined ? { opacity: op.opacity } : {}) });
    } else if (op.kind === "qr") {
      // One rectangle per run of dark modules keeps large documents light.
      const qr = qrModules(op.value);
      const cell = op.size / qr.size;
      page.pushOperators(
        pushGraphicsState(),
        setFillingColor(hex(op.dark)),
        ...qr.runs.map(([column, row, length]) => rectangle(x(op.x + column * cell), y(op.y + (row + 1) * cell), mmToPt(length * cell), mmToPt(cell))),
        fill(),
        popGraphicsState(),
      );
    } else if (op.kind === "symbol") {
      page.drawPage(await symbolForm(context, op.variant), { x: x(op.x), y: y(op.y + op.h), width: mmToPt(op.w), height: mmToPt(op.h) });
    }
  }
}

/**
 * Render scenes to one PDF. Scenes arrive as an async iterable so callers can
 * stream attendees from the database in batches; only the document itself is
 * held in memory.
 */
export async function renderBadgesPdf(scenes: AsyncIterable<BadgeScene> | Iterable<BadgeScene>, options: { layout: BadgePdfLayout; title: string }) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(options.title);
  pdf.setCreator("Space Works Events");
  pdf.setProducer("Space Works Events");
  const fontBytes = await loadBadgeFonts();
  const embedded = await Promise.all(FONT_WEIGHTS.map((weight) => pdf.embedFont(fontBytes.bytes[weight], { subset: true })));
  const fonts = Object.fromEntries(FONT_WEIGHTS.map((weight, index) => [weight, embedded[index]!])) as Record<FontWeight, PDFFont>;
  const context: Context = { pdf, fonts, images: new Map(), symbols: new Map(), prepare: imageCache() };

  let index = 0;
  let sheetPage: PDFPage | null = null;
  for await (const scene of scenes) {
    if (options.layout === "card") {
      const page = pdf.addPage([mmToPt(scene.widthMm), mmToPt(scene.heightMm)]);
      await drawScene(context, page, scene, 0, 0);
    } else {
      const layout = sheetLayout(scene.widthMm, scene.heightMm);
      const slot = sheetSlot(layout, index);
      if (index % layout.perSheet === 0 || !sheetPage) {
        sheetPage = pdf.addPage([mmToPt(layout.sheetWidthMm), mmToPt(layout.sheetHeightMm)]);
        const height = sheetPage.getHeight();
        for (const mark of cropMarks(layout)) {
          sheetPage.drawLine({
            start: { x: mmToPt(mark.x1), y: height - mmToPt(mark.y1) },
            end: { x: mmToPt(mark.x2), y: height - mmToPt(mark.y2) },
            thickness: 0.25,
            color: rgb(0, 0, 0),
          });
        }
      }
      await drawScene(context, sheetPage, scene, slot.xMm, slot.yMm);
    }
    index += 1;
  }
  if (index === 0) pdf.addPage([mmToPt(210), mmToPt(297)]);
  return pdf.save({ objectsPerTick: 200 });
}
