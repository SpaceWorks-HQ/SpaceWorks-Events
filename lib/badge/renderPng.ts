import "server-only";

import sharp from "sharp";
import { PT_TO_MM } from "@/lib/idCardPrint";
import { containBox, imageCache, loadSymbolPaths, qrModules, roundedRectPath, SYMBOL_VIEWBOX } from "./assets";
import { loadBadgeFonts } from "./fonts";
import type { BadgeScene, BadgeTextOp } from "./layout";
import { pixelSize, PNG_DPI } from "./sheet";

/*
 * Badges as PNG: the scene becomes an SVG in millimetres with every glyph
 * converted to an outline (so no system fonts are needed), then sharp
 * rasterises it at 300 dpi.
 */

const n = (value: number) => Number(value.toFixed(3));
const attr = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);

async function textPaths(op: BadgeTextOp) {
  const { faces } = await loadBadgeFonts();
  const face = faces[op.weight];
  const scale = (op.sizePt * PT_TO_MM) / face.unitsPerEm;
  const tracking = op.trackingEm * op.sizePt * PT_TO_MM;
  let cursor = op.x;
  let out = "";
  for (const glyph of face.glyphsForString(op.text)) {
    const d = glyph.path.toSVG();
    if (d) out += `<path transform="translate(${n(cursor)} ${n(op.baseline)}) scale(${scale.toPrecision(6)} ${(-scale).toPrecision(6)})" d="${d}"/>`;
    cursor += glyph.advanceWidth * scale + tracking;
  }
  return out ? `<g fill="${op.color}">${out}</g>` : "";
}

export async function renderBadgeSvg(scene: BadgeScene, dpi = PNG_DPI) {
  const { width, height } = pixelSize(scene.widthMm, scene.heightMm, dpi);
  const prepare = imageCache();
  const parts: string[] = [`<rect width="${scene.widthMm}" height="${scene.heightMm}" fill="${scene.background}"/>`];
  let clipId = 0;
  for (const op of scene.ops) {
    if (op.kind === "rect") {
      if (op.fill) parts.push(`<path d="${roundedRectPath(op.x, op.y, op.w, op.h, op.radius)}" fill="${op.fill}"/>`);
      if (op.stroke) {
        const half = (op.strokeWidth ?? 0.2) / 2;
        parts.push(`<path d="${roundedRectPath(op.x + half, op.y + half, op.w - 2 * half, op.h - 2 * half, Math.max(0, op.radius - half))}" fill="none" stroke="${op.stroke}" stroke-width="${op.strokeWidth ?? 0.2}"/>`);
      }
    } else if (op.kind === "text") {
      parts.push(await textPaths(op));
    } else if (op.kind === "image") {
      const prepared = await prepare(op.url, { wMm: op.w, hMm: op.h, fit: op.fit, shape: op.shape, grayscale: op.grayscale, background: scene.background });
      if (!prepared) continue;
      const at = op.fit === "cover" ? { x: op.x, y: op.y, w: op.w, h: op.h } : containBox(op, prepared.widthPx, prepared.heightPx);
      const href = `data:image/${prepared.format};base64,${prepared.data.toString("base64")}`;
      // Photos were flattened onto the card colour; clip them to their shape so corners never show.
      if (op.shape !== "none") {
        clipId += 1;
        const radius = op.shape === "circle" ? op.w / 2 : op.w * 0.2;
        parts.push(`<clipPath id="c${clipId}"><path d="${roundedRectPath(at.x, at.y, at.w, at.h, radius)}"/></clipPath>`);
        parts.push(`<image clip-path="url(#c${clipId})" x="${n(at.x)}" y="${n(at.y)}" width="${n(at.w)}" height="${n(at.h)}" preserveAspectRatio="none" href="${attr(href)}"/>`);
      } else {
        parts.push(`<image x="${n(at.x)}" y="${n(at.y)}" width="${n(at.w)}" height="${n(at.h)}" preserveAspectRatio="none" href="${attr(href)}"/>`);
      }
    } else if (op.kind === "qr") {
      const qr = qrModules(op.value);
      const scale = op.size / qr.size;
      parts.push(`<path transform="translate(${n(op.x)} ${n(op.y)}) scale(${scale.toPrecision(6)})" d="${qr.d}" fill="${op.dark}" shape-rendering="crispEdges"/>`);
    } else if (op.kind === "symbol") {
      const scale = op.w / SYMBOL_VIEWBOX.width;
      const paths = (await loadSymbolPaths(op.variant)).map((symbolPath) => `<path d="${symbolPath.d}" fill="${symbolPath.fill}"/>`).join("");
      parts.push(`<g transform="translate(${n(op.x)} ${n(op.y)}) scale(${scale.toPrecision(6)})">${paths}</g>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${scene.widthMm} ${scene.heightMm}">${parts.join("")}</svg>`;
  return { svg, width, height };
}

/** One badge as a 300 dpi PNG (CR80: 1011 × 638 px). */
export async function renderBadgePng(scene: BadgeScene) {
  const { svg, width, height } = await renderBadgeSvg(scene);
  return sharp(Buffer.from(svg), { limitInputPixels: false })
    .resize(width, height)
    .flatten({ background: scene.background })
    .png({ compressionLevel: 9 })
    .withMetadata({ density: PNG_DPI })
    .toBuffer();
}
