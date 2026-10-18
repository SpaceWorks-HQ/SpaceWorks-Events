/**
 * Rasterises the Yuyu dot-sign SVG masters in public/brand into the PNG/ICO
 * files browsers, PWAs, social cards and email need. Run after changing a
 * master and commit the outputs:
 *
 *   node scripts/generate-brand-assets.ts
 *
 * (Node 22.18+ runs TypeScript directly; only erasable types are used.)
 */
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const brand = (file: string) => path.join(root, "public", "brand", file);
const appFile = (file: string) => path.join(root, "app", file);

async function rasterise(master: string, width: number, height: number, options: { flatten?: string } = {}): Promise<Buffer> {
  const svg = await readFile(brand(master));
  // Render at a high density so circles stay round and crisp after resizing.
  let image = sharp(svg, { density: Math.max(72, Math.ceil((72 * width) / 100)) }).resize(width, height, { fit: "fill" });
  if (options.flatten) image = image.flatten({ background: options.flatten });
  return image.png({ compressionLevel: 9 }).toBuffer();
}

/** Minimal ICO container holding PNG images (supported by every current browser). */
function ico(images: Array<{ size: number; png: Buffer }>): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

async function main() {
  const outputs: Array<[string, Buffer]> = [
    // Web app manifest
    [brand("icon-192.png"), await rasterise("app-icon.svg", 192, 192)],
    [brand("icon-512.png"), await rasterise("app-icon.svg", 512, 512)],
    [brand("maskable-512.png"), await rasterise("maskable.svg", 512, 512, { flatten: "#18181B" })],
    // iOS home screen: full ink square, no transparency (iOS rounds the corners).
    [brand("apple-touch-icon.png"), await rasterise("apple-touch-icon.svg", 180, 180, { flatten: "#18181B" })],
    // Default social card for Yuyu's own pages
    [brand("og-default.png"), await rasterise("og-default.svg", 1200, 630, { flatten: "#18181B" })],
    // Email header: hosted PNG (never inline SVG in email), 3× for sharp rendering at 36px tall.
    [brand("email-lockup.png"), await rasterise("lockup-horizontal.svg", Math.round((203 * 108) / 60), 108)],
  ];

  // favicon.ico: bright dots only at 16 and 32 (Figma Favicon); full grid at 48.
  const favicon = ico([
    { size: 16, png: await rasterise("favicon-16.svg", 16, 16) },
    { size: 32, png: await rasterise("favicon-32.svg", 32, 32) },
    { size: 48, png: await rasterise("app-icon.svg", 48, 48) },
  ]);

  for (const [file, data] of outputs) {
    await writeFile(file, data);
    console.log("wrote", path.relative(root, file), `${data.length} bytes`);
  }
  await writeFile(appFile("favicon.ico"), favicon);
  console.log("wrote app/favicon.ico", `${favicon.length} bytes`);
  // Next.js file conventions: /icon.svg for modern browsers, /apple-icon.png for iOS.
  await copyFile(brand("favicon-32.svg"), appFile("icon.svg"));
  await copyFile(brand("apple-touch-icon.png"), appFile("apple-icon.png"));
  console.log("copied app/icon.svg and app/apple-icon.png");
}

await main();
