import "server-only";

import { PDFDocument } from "pdf-lib";
import { arrivalWindows } from "@/components/event-dashboard/analytics/metrics";

// The PDF and the Analytics tab share one implementation.
export { arrivalWindows };
import type { EventReportMetrics } from "@/lib/eventReport";
import { getAccentTokens } from "@/lib/theme/accent";
import { safeTimeZone } from "@/lib/timeZone";
import { cleaner, embedFonts, loadLogo } from "./eventReportPdf/fonts";
import { createReportLayout } from "./eventReportPdf/layout";
import { drawAtTheDoor, drawRegistrations } from "./eventReportPdf/sections/attendance";
import { drawAboutAndFooters, drawAnswers, drawBehindTheScenes } from "./eventReportPdf/sections/closing";
import { drawMoney } from "./eventReportPdf/sections/money";
import { drawOverview } from "./eventReportPdf/sections/overview";
import { drawProgramme } from "./eventReportPdf/sections/programme";
import { hex } from "./eventReportPdf/style";

export { woffToSfnt } from "./eventReportPdf/fonts";

/*
 * The post-event report, drawn with pdf-lib in the Space Works look: Gilroy
 * (600 for headings, 400 for text), Deep Ink on white with Warm Cream panels,
 * the event's accent colour for its title and charts, and the Space Works
 * lockup and symbol drawn from the master SVGs. Attendee data arrives as
 * counts only (see EventReportMetrics).
 */

// ---------- The document ----------

/** Generates the report in memory; it never writes report data to disk. */
export async function createEventReportPdf(metrics: EventReportMetrics, now = new Date()): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${metrics.title} – event report`);
  pdf.setAuthor(metrics.organisationName);
  pdf.setCreator("Space Works Events");
  pdf.setProducer("Space Works Events");
  pdf.setCreationDate(now);

  const fonts = await embedFonts(pdf);
  const [lockup, symbol] = await Promise.all([loadLogo("lockup-horizontal"), loadLogo("symbol")]);
  const clean = cleaner(fonts.supports);
  const tz = safeTimeZone(metrics.timeZone);
  const accent = getAccentTokens(metrics.accentColor, "light");
  const A = { solid: hex(accent["--yy-accent"]), soft: hex(accent["--yy-accent-soft"]), on: hex(accent["--yy-on-accent"]), text: hex(accent["--yy-accent-text"]) };

  const L = createReportLayout(pdf, metrics, fonts, clean, A);
  drawOverview(L, metrics, tz, lockup);
  drawRegistrations(L, metrics, tz);
  drawAtTheDoor(L, metrics, tz);
  drawMoney(L, metrics);
  drawProgramme(L, metrics, tz, now);
  drawAnswers(L, metrics);
  drawBehindTheScenes(L, metrics, tz);
  drawAboutAndFooters(L, metrics, tz, now, symbol);

  return pdf.save();
}
