import "server-only";

import { setCharacterSpacing, type Color, type PDFDocument, type PDFPage } from "pdf-lib";
import type { EventReportMetrics, ReportQuestion } from "@/lib/eventReport";
import type { Fonts, LogoArt } from "./fonts";
import { BOTTOM, C, CONTENT_WIDTH, MARGIN, PAGE, TOP, percentLabel, plural, roundedRectPath, type Style } from "./style";

/** The event's accent colour, resolved for the report. */
export type ReportAccent = { solid: Color; soft: Color; on: Color; text: Color };

export type ReportLayout = ReturnType<typeof createReportLayout>;

/**
 * Text styles, drawing helpers and the page flow shared by every section.
 * `page` and `y` (the cursor, measured from the bottom) change as sections draw.
 */
export function createReportLayout(pdf: PDFDocument, metrics: EventReportMetrics, fonts: Fonts, clean: (value: string) => string, A: ReportAccent) {
  const T = {
    display: (size: number, color = C.ink): Style => ({ font: fonts.display, size, color, tracking: -0.015 }),
    heading: (size: number, color = C.ink): Style => ({ font: fonts.display, size, color, tracking: -0.01 }),
    body: (size = 10.5, color = C.textSecondary): Style => ({ font: fonts.regular, size, color }),
    strong: (size = 10.5, color = C.ink): Style => ({ font: fonts.bold, size, color }),
    overline: (color = C.textMuted): Style => ({ font: fonts.bold, size: 8, color, tracking: 0.08 }),
  };

  const textWidth = (text: string, style: Style) => style.font.widthOfTextAtSize(text, style.size) + (style.tracking ?? 0) * style.size * Math.max(0, [...text].length - 1);

  const drawText = (page: PDFPage, value: string, x: number, y: number, style: Style) => {
    const text = clean(value);
    if (!text) return;
    if (style.tracking) page.pushOperators(setCharacterSpacing(style.tracking * style.size));
    page.drawText(text, { x, y, size: style.size, font: style.font, color: style.color });
    if (style.tracking) page.pushOperators(setCharacterSpacing(0));
  };

  const fit = (value: string, style: Style, maxWidth: number) => {
    let text = clean(value);
    if (textWidth(text, style) <= maxWidth) return text;
    while (text.length > 1 && textWidth(`${text}…`, style) > maxWidth) text = text.slice(0, -1);
    return `${text.trimEnd()}…`;
  };

  const wrap = (value: string, style: Style, maxWidth: number) => {
    const lines: string[] = [];
    let line = "";
    for (const word of clean(value).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, style) <= maxWidth || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
      if (textWidth(line, style) > maxWidth) {
        lines.push(fit(line, style, maxWidth));
        line = "";
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const box = (page: PDFPage, x: number, top: number, width: number, height: number, options: { fill?: Color; border?: Color; radius?: number }) =>
    page.drawSvgPath(roundedRectPath(width, height, options.radius ?? 12), {
      x,
      y: top,
      color: options.fill,
      borderColor: options.border,
      borderWidth: options.border ? 0.75 : 0,
    });

  const bar = (page: PDFPage, x: number, y: number, width: number, ratio: number, color: Color, height = 8) => {
    box(page, x, y + height, width, height, { fill: C.track, radius: height / 2 });
    const filled = Math.max(0, Math.min(1, ratio)) * width;
    if (filled > 0) box(page, x, y + height, Math.max(filled, height), height, { fill: color, radius: height / 2 });
  };

  /** Draws a logo master `height` points tall with its top-left corner at (x, top); returns its width. */
  const drawLogo = (page: PDFPage, art: LogoArt | null, x: number, top: number, height: number) => {
    if (!art) return 0;
    const scale = height / art.height;
    for (const part of art.paths) page.drawSvgPath(part.d, { x, y: top, scale, color: part.color });
    return art.width * scale;
  };

  // ---------- Pages and flow ----------

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const newPage = () => {
    page = pdf.addPage(PAGE);
    pages.push(page);
    if (pages.length > 1) {
      const left = fit(`${metrics.organisationName}  ·  ${metrics.title}`, T.body(8.5, C.textMuted), CONTENT_WIDTH - 120);
      drawText(page, left, MARGIN, PAGE[1] - 40, T.body(8.5, C.textMuted));
      const right = metrics.targetType === "occurrence" ? "Series date report" : "Event report";
      drawText(page, right, PAGE[0] - MARGIN - textWidth(right, T.strong(8.5, C.textMuted)), PAGE[1] - 40, T.strong(8.5, C.textMuted));
      page.drawLine({ start: { x: MARGIN, y: PAGE[1] - 52 }, end: { x: PAGE[0] - MARGIN, y: PAGE[1] - 52 }, thickness: 0.75, color: C.border });
    }
    y = TOP;
  };

  const ensure = (height: number) => {
    if (y - height < BOTTOM) newPage();
  };

  const paragraph = (value: string, style = T.body(), width = CONTENT_WIDTH, x = MARGIN, gapAfter = 8) => {
    const lineHeight = style.size * 1.5;
    const lines = wrap(value, style, width);
    // Keep short paragraphs in one piece.
    if (lines.length <= 6) ensure(lines.length * lineHeight);
    for (const line of lines) {
      ensure(lineHeight);
      drawText(page, line, x, y - style.size, style);
      y -= lineHeight;
    }
    y -= gapAfter;
  };

  const section = (overline: string, title: string, intro?: string) => {
    // Sections share a page when a good part of it is left.
    if (y - 280 < BOTTOM) newPage();
    else if (y < TOP - 1) y -= 30;
    drawText(page, overline.toUpperCase(), MARGIN, y - 8, T.overline(A.text));
    drawText(page, title, MARGIN, y - 36, T.display(26));
    y -= 52;
    if (intro) paragraph(intro, T.body(11), CONTENT_WIDTH * 0.85, MARGIN, 10);
    y -= 6;
  };

  /** `keepWith` is the height of what follows, so a heading never ends a page alone. */
  const subheading = (title: string, note?: string, keepWith = 0) => {
    ensure((note ? 60 : 44) + keepWith);
    y -= 10;
    drawText(page, title, MARGIN, y - 15, T.heading(15));
    y -= 24;
    if (note) paragraph(note, T.body(9.5, C.textMuted), CONTENT_WIDTH, MARGIN, 4);
    y -= 6;
  };

  /** Label · bar · value rows, for funnels and question answers. */
  const barRows = (rows: Array<{ label: string; value: number; whole: number; color: Color; note?: string }>) => {
    const labelWidth = 178;
    const valueWidth = 82;
    const barWidth = CONTENT_WIDTH - labelWidth - valueWidth - 24;
    for (const row of rows) {
      ensure(24);
      drawText(page, fit(row.label, T.body(10, C.ink), labelWidth - 8), MARGIN, y - 12, T.body(10, C.ink));
      bar(page, MARGIN + labelWidth, y - 13, barWidth, row.whole > 0 ? row.value / row.whole : 0, row.color);
      const value = row.note ?? `${row.value.toLocaleString("en-GB")}  ·  ${percentLabel(row.value, row.whole)}`;
      drawText(page, value, PAGE[0] - MARGIN - textWidth(clean(value), T.strong(9.5)), y - 12, T.strong(9.5));
      y -= 24;
    }
    y -= 4;
  };

  /** Two-column facts list. */
  const facts = (rows: Array<[string, string]>) => {
    for (const [name, value] of rows) {
      const lines = wrap(value, T.body(10.5, C.ink), CONTENT_WIDTH - 170);
      ensure(lines.length * 16 + 10);
      drawText(page, name, MARGIN, y - 11, T.strong(9.5, C.textMuted));
      lines.forEach((line, index) => drawText(page, line, MARGIN + 170, y - 11 - index * 16, T.body(10.5, C.ink)));
      y -= lines.length * 16 + 10;
      page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PAGE[0] - MARGIN, y: y + 4 }, thickness: 0.5, color: C.border });
    }
    y -= 8;
  };

  /** A column chart in a soft card. */
  const columnChart = (columns: Array<{ label: string; count: number }>, color: Color, caption: string) => {
    const height = 168;
    ensure(height + 34);
    const top = y;
    box(page, MARGIN, top, CONTENT_WIDTH, height, { fill: C.subtle, border: C.border, radius: 16 });
    const plotTop = top - 30;
    const plotBottom = top - height + 34;
    const plotHeight = plotTop - plotBottom;
    const largest = Math.max(1, ...columns.map((column) => column.count));
    const slot = (CONTENT_WIDTH - 40) / columns.length;
    const barWidth = Math.min(28, slot * 0.62);
    // Show every label that fits; otherwise every second or third one.
    const widest = Math.max(...columns.map((column) => textWidth(clean(column.label), T.body(7.5, C.textMuted))));
    const labelEvery = Math.max(1, Math.ceil((widest + 8) / slot));
    columns.forEach((column, index) => {
      const centre = MARGIN + 20 + slot * index + slot / 2;
      const barHeight = column.count > 0 ? Math.max(4, (column.count / largest) * plotHeight) : 0;
      if (barHeight > 0) {
        box(page, centre - barWidth / 2, plotBottom + barHeight, barWidth, barHeight, { fill: color, radius: Math.min(5, barWidth / 2) });
        const value = String(column.count);
        drawText(page, value, centre - textWidth(value, T.strong(8)) / 2, plotBottom + barHeight + 5, T.strong(8));
      } else {
        page.drawLine({ start: { x: centre - barWidth / 2, y: plotBottom }, end: { x: centre + barWidth / 2, y: plotBottom }, thickness: 1, color: C.border });
      }
      if (index % labelEvery === 0) {
        const label = fit(column.label, T.body(7.5, C.textMuted), slot * labelEvery - 4);
        drawText(page, label, centre - textWidth(label, T.body(7.5, C.textMuted)) / 2, plotBottom - 16, T.body(7.5, C.textMuted));
      }
    });
    y = top - height - 10;
    paragraph(caption, T.body(9.5, C.textMuted), CONTENT_WIDTH, MARGIN, 6);
  };

  const chips = (items: Array<{ label: string; bg: Color; fg: Color }>) => {
    ensure(36);
    let x = MARGIN;
    for (const item of items) {
      const width = textWidth(clean(item.label), T.strong(9.5)) + 22;
      box(page, x, y, width, 24, { fill: item.bg, radius: 12 });
      drawText(page, item.label, x + 11, y - 16, T.strong(9.5, item.fg));
      x += width + 8;
    }
    y -= 36;
  };

  const questions = (list: ReportQuestion[], color: Color, writtenNote: string) => {
    for (const question of list) {
      const titleLines = wrap(question.label, T.strong(11), CONTENT_WIDTH);
      ensure(titleLines.length * 16 + 44);
      y -= 6;
      for (const line of titleLines) {
        drawText(page, line, MARGIN, y - 11, T.strong(11));
        y -= 16;
      }
      drawText(page, `${plural(question.answered, "answer")}`, MARGIN, y - 10, T.body(9, C.textMuted));
      y -= 20;
      if (question.choices && question.answered > 0) {
        const whole = question.type === "MULTI_SELECT" ? question.answered : question.choices.reduce((sum, choice) => sum + choice.count, 0);
        barRows(question.choices.map((choice) => ({ label: choice.label, value: choice.count, whole, color })));
      } else if (!question.choices && question.answered > 0) {
        paragraph(writtenNote, T.body(9.5, C.textMuted), CONTENT_WIDTH, MARGIN, 6);
      } else {
        y -= 4;
      }
    }
  };

  return {
    A,
    T,
    clean,
    textWidth,
    drawText,
    fit,
    wrap,
    box,
    bar,
    drawLogo,
    pages,
    newPage,
    ensure,
    paragraph,
    section,
    subheading,
    barRows,
    facts,
    columnChart,
    chips,
    questions,
    get page() {
      return page;
    },
    get y() {
      return y;
    },
    set y(value: number) {
      y = value;
    },
  };
}
