/**
 * Draws the README artwork in docs/readme/: the 1280×400 hero banner for
 * light and dark mode, and the brand colour swatches. Run after changing the
 * brand masters or the banner copy, and commit the outputs:
 *
 *   npm run readme:art
 *
 * The banner is laid out in HTML and rendered by headless Chromium (the
 * Playwright browser the e2e tests already install), so Gilroy and the
 * Unbounded variable font are embedded exactly as the app ships them.
 * The lockup is the unaltered master from public/brand/logo. sharp then
 * flattens and compresses the PNG.
 * (Node 22.18+ runs TypeScript directly; only erasable types are used.)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const out = (file: string) => path.join(root, "docs", "readme", file);
const fontFile = (file: string) => path.join(root, "public", "brand", "fonts", file);
const logoFile = (file: string) => path.join(root, "public", "brand", "logo", file);

const WIDTH = 1280;
const HEIGHT = 400;

/** The seven brand colours (SpaceWorks-Design tokens.json). */
const BRAND = {
  "deep-ink": "#142C2A",
  "maker-teal": "#006E63",
  "workshop-orange": "#FF7447",
  citron: "#DFFF8F",
  "sky-blue": "#B5CDFF",
  "warm-yellow": "#FFD447",
  "warm-cream": "#FFF4E8",
} as const;

type Theme = { file: string; field: string; ink: string; muted: string; rule: string; lockup: string; teal: string };

const THEMES: Theme[] = [
  { file: "banner.png", field: BRAND["warm-cream"], ink: BRAND["deep-ink"], muted: "#43544F", rule: "#C9CCC2", lockup: "lockup-horizontal.svg", teal: BRAND["maker-teal"] },
  // Dark mode is built only from the brand's reversed pairings: Deep Ink field, Warm Cream text.
  { file: "banner-dark.png", field: BRAND["deep-ink"], ink: BRAND["warm-cream"], muted: "#D5D3CA", rule: "#4A5C58", lockup: "lockup-horizontal-reversed.svg", teal: "#579C90" },
];

async function dataUrl(file: string, type: string) {
  return `data:${type};base64,${(await readFile(file)).toString("base64")}`;
}

async function bannerHtml(theme: Theme) {
  const [regular, semibold, unbounded, lockup] = await Promise.all([
    dataUrl(fontFile("Gilroy-Regular.woff"), "font/woff"),
    dataUrl(fontFile("Gilroy-SemiBold.woff"), "font/woff"),
    dataUrl(fontFile("Unbounded-Variable.woff2"), "font/woff2"),
    dataUrl(logoFile(theme.lockup), "image/svg+xml"),
  ]);
  // Lockup at the public-header size (300 × 48); clear space of a quarter of
  // the symbol height or more on every side. One accent phrase in Unbounded,
  // and simple brand shapes with a single Workshop Orange moment.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Gilroy; font-weight: 400; src: url(${regular}) format("woff"); }
    @font-face { font-family: Gilroy; font-weight: 600; src: url(${semibold}) format("woff"); }
    @font-face { font-family: Unbounded; font-weight: 200 900; src: url(${unbounded}) format("woff2"); }
    * { margin: 0; box-sizing: border-box; }
    html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: ${theme.field}; }
    body { position: relative; font-family: Gilroy; color: ${theme.ink}; font-synthesis: none; -webkit-font-smoothing: antialiased; }
    .brand { position: absolute; left: 72px; top: 56px; display: flex; align-items: center; }
    .brand img { width: 300px; height: 48px; display: block; }
    .brand .rule { width: 1.5px; height: 30px; background: ${theme.rule}; margin: 0 20px 0 24px; }
    .brand .product { font-weight: 600; font-size: 30px; line-height: 1; letter-spacing: -0.005em; }
    .accent { position: absolute; left: 72px; top: 152px; font-family: Unbounded; font-weight: 500; font-size: 58px; line-height: 66px; letter-spacing: -0.01em; }
    .sub { position: absolute; left: 72px; top: 302px; font-size: 22px; line-height: 30px; color: ${theme.muted}; }
    svg.shapes { position: absolute; inset: 0; }
  </style></head><body>
    <svg class="shapes" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">
      <circle cx="905" cy="430" r="150" fill="${BRAND.citron}"/>
      <rect x="958" y="58" width="150" height="150" rx="32" fill="${BRAND["sky-blue"]}"/>
      <path d="M${WIDTH} 150 A 250 250 0 0 0 ${WIDTH - 250} 400 L${WIDTH} 400 Z" fill="${theme.teal}"/>
      <circle cx="1196" cy="84" r="34" fill="${BRAND["workshop-orange"]}"/>
    </svg>
    <div class="brand"><img src="${lockup}" alt=""><span class="rule"></span><span class="product">Events</span></div>
    <p class="accent">Less admin.<br>More making.</p>
    <p class="sub">Free, open-source events for makers and communities.</p>
  </body></html>`;
}

/** A small rounded swatch for the README palette table, with a mid-grey hairline so light and dark colours stay visible on both GitHub themes. */
function swatch(hex: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="24" viewBox="0 0 48 24"><rect x="0.5" y="0.5" width="47" height="23" rx="6" fill="${hex}" stroke="#7F8C89" stroke-opacity="0.6"/></svg>\n`;
}

async function main() {
  await mkdir(out(""), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    for (const theme of THEMES) {
      await page.setContent(await bannerHtml(theme), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const shot = await page.screenshot({ type: "png" });
      const png = await sharp(shot).flatten({ background: theme.field }).png({ compressionLevel: 9, palette: true, colours: 128, dither: 0 }).toBuffer();
      await writeFile(out(theme.file), png);
      console.log("wrote", path.relative(root, out(theme.file)), `${png.length} bytes`);
    }
  } finally {
    await browser.close();
  }
  for (const [name, hex] of Object.entries(BRAND)) {
    await writeFile(out(`swatch-${name}.svg`), swatch(hex));
  }
  console.log(`wrote ${Object.keys(BRAND).length} swatches`);
}

await main();
