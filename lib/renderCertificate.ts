import "server-only";
import sharp from "sharp";
import {
  certificateFonts,
  certificateTemplateKeys,
  certificateTemplateSchema,
  fillCertificateText,
  type CertificateImageElement,
  type CertificateMergeValues,
  type CertificateTemplate,
  type CertificateTextElement,
} from "./certificateTemplate";
import { formatDate } from "./format/datetime";
import { downloadFile } from "./storage";

const escapeMarkup = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/** Merge-tag values for one certificate; dates use the event's timezone. */
export function certificateMergeValues(input: { name: string; eventTitle: string; eventStart: Date; timeZone: string; organisationName: string; issuedAt: Date }): CertificateMergeValues {
  return {
    name: input.name,
    event: input.eventTitle,
    eventDate: formatDate(input.eventStart, input.timeZone),
    organisation: input.organisationName,
    issueDate: formatDate(input.issuedAt, input.timeZone),
  };
}

type Box = { left: number; top: number; width: number; height: number };
type Layer = { input: Buffer; left: number; top: number };

function boxFor(element: { x: number; y: number; width: number; height: number }, width: number, height: number): Box {
  return {
    left: Math.floor(width * element.x / 100),
    top: Math.floor(height * element.y / 100),
    width: Math.max(1, Math.floor(width * element.width / 100)),
    height: Math.max(1, Math.floor(height * element.height / 100)),
  };
}

/** True when every key belongs to this organisation's certificate folders. */
export function certificateKeysBelongTo(template: CertificateTemplate, organisationId: string) {
  const { background, assets } = certificateTemplateKeys(template);
  return background.startsWith(`organisations/${organisationId}/certificate-backgrounds/`) && assets.every((key) => key.startsWith(`organisations/${organisationId}/certificate-assets/`));
}

async function textLayer(element: CertificateTextElement, values: CertificateMergeValues, width: number, height: number): Promise<Layer | null> {
  const filled = fillCertificateText(element.text, values).replace(/\t/g, " ").replace(/\r\n?/g, "\n").trim().slice(0, 600);
  if (!filled) return null;
  const text = element.uppercase ? filled.toLocaleUpperCase("en") : filled;
  const area = boxFor(element, width, height);
  const style = [element.bold ? "Bold" : "", element.italic ? "Italic" : ""].filter(Boolean).join(" ");
  // Measure first, then rasterize at the final font size: never shrink a bitmap
  // of the text, which blurs thin strokes and small glyphs.
  const render = (size: number) => {
    const spacing = Math.round(size * element.letterSpacing / 100 * 1024);
    return sharp({ text: {
      text: `<span foreground="${element.color}"${spacing ? ` letter_spacing="${spacing}"` : ""}>${escapeMarkup(text)}</span>`,
      font: `${certificateFonts[element.font].family}${style ? ` ${style}` : ""} ${size}`,
      width: area.width,
      wrap: "word",
      align: element.align === "center" ? "centre" : element.align,
      dpi: 72, rgba: true,
    } }).png().toBuffer({ resolveWithObject: true });
  };
  let size = Math.max(1, element.fontSize * width / 1000);
  let fitted = await render(size);
  for (let attempt = 0; attempt < 8 && (fitted.info.width > area.width || fitted.info.height > area.height); attempt++) {
    size *= Math.min(area.width / fitted.info.width, area.height / fitted.info.height) * 0.97;
    fitted = await render(Math.max(1, size));
  }
  if (fitted.info.width > area.width || fitted.info.height > area.height) throw new Error("Text area is too small.");
  const offset = element.align === "center" ? (area.width - fitted.info.width) / 2 : element.align === "right" ? area.width - fitted.info.width : 0;
  return { input: fitted.data, left: Math.floor(area.left + offset), top: Math.floor(area.top + (area.height - fitted.info.height) / 2) };
}

async function imageLayer(element: CertificateImageElement, body: Buffer, width: number, height: number): Promise<Layer> {
  const area = boxFor(element, width, height);
  const { data, info } = await sharp(body).ensureAlpha().resize(area.width, area.height, { fit: "inside" }).png().toBuffer({ resolveWithObject: true });
  return { input: data, left: Math.floor(area.left + (area.width - info.width) / 2), top: Math.floor(area.top + (area.height - info.height) / 2) };
}

export async function renderCustomCertificate(template: CertificateTemplate, values: CertificateMergeValues, organisationId: string) {
  const config = certificateTemplateSchema.parse(template);
  if (!certificateKeysBelongTo(config, organisationId)) throw new Error("Invalid certificate image.");
  const image = await downloadFile(config.backgroundKey);
  if (!image) throw new Error("Certificate background unavailable.");
  const source = await sharp(image.body).metadata();
  if (!source.width || !source.height) throw new Error("Invalid certificate dimensions.");

  const assetKeys = [...new Set(certificateTemplateKeys(config).assets)];
  const assets = new Map(await Promise.all(assetKeys.map(async (key) => {
    const file = await downloadFile(key);
    if (!file) throw new Error("Certificate image unavailable.");
    return [key, Buffer.from(file.body)] as const;
  })));

  // Give text a print-sized canvas even when older backgrounds were resized.
  // Upsampling cannot recover missing detail in an already compressed background.
  const scale = Math.max(1, 3508 / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const layers = (await Promise.all(config.elements.map((element) =>
    element.type === "text" ? textLayer(element, values, width, height) : imageLayer(element, assets.get(element.key)!, width, height),
  ))).filter((layer): layer is Layer => layer != null);

  // Flatten the background before compositing so transparent artwork prints on white.
  const base = await sharp(image.body).resize(width, height).flatten({ background: "#fff" }).png().toBuffer();
  return sharp(base).composite(layers).withMetadata({ density: 300 }).jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer();
}
