// Builds docs/Yuyu-User-Manual.pdf from docs/manual/user-manual.html.
//
// Usage: node docs/manual/build-manual.mjs
//
// Uses the Chromium that ships with the project's Playwright dependency and
// pdf-lib (already a runtime dependency) to merge the full-bleed cover with
// the numbered body. The table of contents gets real page numbers by
// rendering each chapter on its own first and counting pages.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const htmlPath = resolve(here, "user-manual.html");
const outPath = resolve(root, "docs", "Yuyu-User-Manual.pdf");

const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
// The dark-surface horizontal lockup (dot-grid mark + wordmark) sits on the dark cover.
const mark = await readFile(resolve(root, "public", "brand", "lockup-horizontal-dark.svg"), "utf8");
const edition = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

const template = await readFile(htmlPath, "utf8");

const footer = `
  <div style="width:100%;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:7.5pt;color:#6b7673;
              padding:0 20mm;display:flex;justify-content:space-between;align-items:center;">
    <span>Yuyu User Manual</span>
    <span style="font-variant-numeric:tabular-nums;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;

const bodyPdfOptions = {
  format: "A4",
  printBackground: true,
  preferCSSPageSize: false,
  margin: { top: "18mm", bottom: "18mm", left: "20mm", right: "20mm" },
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: footer,
};

function fill(html, values) {
  return Object.entries(values).reduce((acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value), html);
}

/** Split the template into cover, toc, and chapter fragments without a DOM dependency. */
function splitTemplate(html) {
  const head = html.slice(0, html.indexOf("<body>") + "<body>".length);
  const tail = "</body></html>";
  const cover = html.slice(html.indexOf('<div class="cover"'), html.indexOf("<!-- ================= TOC"));
  const toc = html.slice(html.indexOf('<div class="sheet" id="toc"'), html.indexOf('<div class="page-body">'));
  const bodyStart = html.indexOf('<div class="page-body">');
  const bodyEnd = html.lastIndexOf("</body>");
  const body = html.slice(bodyStart, bodyEnd);
  const chapters = [];
  const re = /<section class="chapter"[\s\S]*?<\/section>/g;
  for (const match of body.matchAll(re)) {
    const html = match[0];
    const attr = (name) => (html.match(new RegExp(`data-${name}="([^"]*)"`)) ?? [])[1] ?? "";
    chapters.push({ html, part: attr("part"), title: attr("title"), sub: attr("sub") });
  }
  return { head, tail, cover, toc, chapters };
}

const parts = splitTemplate(template);
const browser = await chromium.launch();
const page = await browser.newPage();

async function render(html, options) {
  await page.setContent(html, { waitUntil: "load" });
  return page.pdf(options);
}

async function pageCount(buffer) {
  return (await PDFDocument.load(buffer)).getPageCount();
}

// Pass 1: measure chapters and the TOC so the contents page can show real page numbers.
const chapterPages = [];
for (const chapter of parts.chapters) {
  const buffer = await render(parts.head + '<div class="page-body">' + chapter.html + "</div>" + parts.tail, bodyPdfOptions);
  chapterPages.push(await pageCount(buffer));
}
function buildTocItems(tocPages) {
  // Body page numbering starts at 1 on the contents page (the cover is unnumbered).
  let cursor = tocPages + 1;
  let lastPart = "";
  const items = [];
  parts.chapters.forEach((chapter, index) => {
    if (chapter.part !== lastPart) {
      items.push(`<li class="part"><span class="n"></span><span class="t">${chapter.part}</span><span class="p"></span></li>`);
      lastPart = chapter.part;
    }
    items.push(`<li><span class="n">${index + 1}</span><span class="t">${chapter.title}<small>${chapter.sub}</small></span><span class="p">${cursor}</span></li>`);
    cursor += chapterPages[index];
  });
  return items;
}

// Measure the real contents page and iterate until its own length is accounted for.
let tocPages = 1;
let tocItems = buildTocItems(tocPages);
for (let attempt = 0; attempt < 4; attempt++) {
  const measured = await pageCount(await render(fill(parts.head + parts.toc + parts.tail, { TOC: tocItems.join(""), EDITION: edition, VERSION: pkg.version }), bodyPdfOptions));
  if (measured === tocPages) break;
  tocPages = measured;
  tocItems = buildTocItems(tocPages);
}

// Pass 2: final cover (full bleed, no footer) and numbered body (TOC + chapters).
const values = { YUYU_MARK: mark, EDITION: edition, VERSION: pkg.version, TOC: tocItems.join("") };
const coverPdf = await render(fill(parts.head + parts.cover + parts.tail, values), {
  format: "A4",
  printBackground: true,
  margin: { top: "0", bottom: "0", left: "0", right: "0" },
  displayHeaderFooter: false,
});
const bodyHtml = fill(parts.head + parts.toc + '<div class="page-body">' + parts.chapters.map((c) => c.html).join("") + "</div>" + parts.tail, values);
const bodyPdf = await render(bodyHtml, bodyPdfOptions);
await browser.close();

// Merge and stamp metadata.
const out = await PDFDocument.create();
for (const buffer of [coverPdf, bodyPdf]) {
  const src = await PDFDocument.load(buffer);
  const pages = await out.copyPages(src, src.getPageIndices());
  pages.forEach((p) => out.addPage(p));
}
out.setTitle("Yuyu User Manual");
out.setAuthor("Yuyu");
out.setSubject("User manual for organisers, door staff, attendees, and instance administrators");
out.setKeywords(["yuyu", "events", "user manual", "rsvp", "check-in", "feedback", "certificates"]);
out.setProducer("Yuyu docs build");
out.setCreator("docs/manual/build-manual.mjs");
await writeFile(outPath, await out.save());

console.log(`Wrote ${outPath}`);
console.log(`Pages: cover 1, contents ${tocPages}, chapters ${chapterPages.join(" + ")} = ${out.getPageCount()} total`);
