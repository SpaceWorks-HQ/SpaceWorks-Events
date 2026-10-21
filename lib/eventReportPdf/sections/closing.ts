import "server-only";

import type { EventReportMetrics } from "@/lib/eventReport";
import { formatDate, formatDayLong, formatTime, formatTimeZoneName } from "@/lib/format/datetime";
import type { LogoArt } from "../fonts";
import type { ReportLayout } from "../layout";
import { C, CONTENT_WIDTH, MARGIN, PAGE, percentLabel, plural } from "../style";

/** Feedback answers, then the answers to the registration questions. */
export function drawAnswers(L: ReportLayout, metrics: EventReportMetrics) {
  const { A, T, paragraph, section, questions } = L;
  // ---------- Feedback ----------

  const feedbackQuestions = metrics.feedbackQuestions ?? [];
  if (metrics.feedbackResponseCount != null && (metrics.feedbackResponseCount > 0 || feedbackQuestions.length > 0)) {
    const base = metrics.checkedIn || metrics.confirmed;
    section(
      "What people thought",
      "Feedback",
      `${plural(metrics.feedbackResponseCount, "response")} to “${metrics.feedbackTitle || "Event feedback"}”, from ${plural(base, "person", "people")} who ${metrics.checkedIn ? "checked in" : "had a place"} (${percentLabel(metrics.feedbackResponseCount, base)}).${metrics.certificatesEnabled ? " Certificates were offered with this form." : ""}`,
    );
    if (metrics.feedbackResponseCount === 0) paragraph("Nobody answered the feedback form.", T.body(), CONTENT_WIDTH);
    else questions(feedbackQuestions, A.solid, "Written answers are counted here, not shown. Read them in the feedback export.");
  }

  // ---------- Registration answers ----------

  const registrationQuestions = metrics.registrationQuestions ?? [];
  if (registrationQuestions.length) {
    section("What guests told you", "Registration answers", `Answers from the ${plural(metrics.confirmed, "person", "people")} going. Written answers, emails and phone numbers are counted, never shown.`);
    questions(registrationQuestions, A.solid, "Typed answers are counted here, not shown. Read them in the guest list export.");
  }
}

/** Emails sent to guests and the team behind the event. */
export function drawBehindTheScenes(L: ReportLayout, metrics: EventReportMetrics, tz: string) {
  const { T, textWidth, drawText, fit, ensure, paragraph, section, subheading, facts } = L;
  // ---------- Emails and team ----------

  const broadcasts = metrics.broadcasts ?? [];
  section("Behind the scenes", metrics.targetType === "occurrence" ? "Team" : "Emails and team");
  if (metrics.targetType === "occurrence") {
    // Emails belong to one-off events; a series date has no email history of its own.
  } else if (broadcasts.length) {
    subheading("Emails to guests", `${plural(broadcasts.length, "email")} sent from Space Works Events, ${plural(broadcasts.reduce((sum, item) => sum + item.recipientCount, 0), "delivery", "deliveries")} in total. Confirmation and ticket emails are not included.`);
    for (const broadcast of broadcasts) {
      ensure(30);
      drawText(L.page, formatDate(broadcast.sentAt, tz), MARGIN, L.y - 11, T.strong(9.5, C.textSecondary));
      drawText(L.page, fit(broadcast.subject, T.body(10.5, C.ink), CONTENT_WIDTH - 230), MARGIN + 110, L.y - 11, T.body(10.5, C.ink));
      const count = plural(broadcast.recipientCount, "recipient");
      drawText(L.page, count, PAGE[0] - MARGIN - textWidth(count, T.strong(9.5)), L.y - 11, T.strong(9.5));
      L.y -= 24;
      L.page.drawLine({ start: { x: MARGIN, y: L.y + 6 }, end: { x: PAGE[0] - MARGIN, y: L.y + 6 }, thickness: 0.5, color: C.border });
    }
    L.y -= 8;
  } else {
    paragraph("No emails were sent to guests from Space Works Events, apart from confirmations and tickets.", T.body(), CONTENT_WIDTH);
  }
  if (metrics.targetType !== "occurrence") subheading("Team");
  facts([
    ["Co-organisers", metrics.coOrganiserCount ? `${plural(metrics.coOrganiserCount, "person", "people")} helped run this event` : "None added"],
  ]);
}

/** The closing note on how the report was made, then a footer on every page. */
export function drawAboutAndFooters(L: ReportLayout, metrics: EventReportMetrics, tz: string, now: Date, symbol: LogoArt | null) {
  const { T, textWidth, drawText, wrap, box, drawLogo, pages, ensure } = L;
  // ---------- About this report ----------

  ensure(172);
  L.y -= 12;
  box(L.page, MARGIN, L.y, CONTENT_WIDTH, 140, { fill: C.subtle, radius: 16 });
  // The symbol at its 48px (36pt) minimum.
  const symbolWidth = drawLogo(L.page, symbol, MARGIN + 18, L.y - 18, 36);
  const aboutX = MARGIN + 18 + (symbolWidth ? symbolWidth + 16 : 0);
  drawText(L.page, "About this report", aboutX, L.y - 32, T.heading(13));
  const generated = `Report generated on ${formatDayLong(now, tz, new Date(0))} at ${formatTime(now, tz)} ${formatTimeZoneName(now, tz)}`;
  drawText(L.page, generated, aboutX, L.y - 52, T.strong(10));
  const about = `Numbers reflect what Space Works Events recorded at that moment. Times are in ${formatTimeZoneName(metrics.startDateTime, tz)} (${tz}). This report holds counts and totals only: no guest is named, and no email address, phone number, ticket or written answer is included. Keep it with your event records, or share it with your team, partners and sponsors.`;
  const aboutLines = wrap(about, T.body(9.5), PAGE[0] - MARGIN - 18 - aboutX);
  aboutLines.slice(0, 5).forEach((line, index) => drawText(L.page, line, aboutX, L.y - 74 - index * 14, T.body(9.5)));
  L.y -= 152;

  // ---------- Footers ----------

  pages.forEach((current, index) => {
    current.drawLine({ start: { x: MARGIN, y: 52 }, end: { x: PAGE[0] - MARGIN, y: 52 }, thickness: 0.75, color: C.border });
    drawText(current, "Space Works Events  ·  Counts and totals only, no guest is named", MARGIN, 28, T.body(8, C.textMuted));
    const label = `Page ${index + 1} of ${pages.length}`;
    drawText(current, label, PAGE[0] - MARGIN - textWidth(label, T.strong(8, C.textMuted)), 28, T.strong(8, C.textMuted));
  });
}
