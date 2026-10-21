import "server-only";

import type { EventReportMetrics } from "@/lib/eventReport";
import { formatDate, formatDateBlock, formatDayLong, formatTime, formatTimeRange } from "@/lib/format/datetime";
import type { LogoArt } from "../fonts";
import type { ReportLayout } from "../layout";
import { C, CONTENT_WIDTH, MARGIN, PAGE, PRIVACY, percentLabel, plural } from "../style";

/** Page 1: the header band, the event's details and the key numbers. */
export function drawOverview(L: ReportLayout, metrics: EventReportMetrics, tz: string, lockup: LogoArt | null) {
  const { A, T, textWidth, drawText, fit, wrap, box, drawLogo, newPage, ensure, paragraph, facts } = L;
  // ---------- Page 1: header band, details and key numbers ----------

  newPage();
  const titleStyle = T.display(metrics.title.length > 42 ? 28 : 34, A.text);
  const titleLines = wrap(metrics.title, titleStyle, CONTENT_WIDTH).slice(0, 3);
  const tagline = metrics.tagline?.trim() ? fit(metrics.tagline, T.body(11.5), CONTENT_WIDTH) : "";
  const bandHeight = 112 + titleLines.length * titleStyle.size * 1.04 + (tagline ? 22 : 0);
  L.page.drawRectangle({ x: 0, y: PAGE[1] - bandHeight, width: PAGE[0], height: bandHeight, color: A.soft });
  // Space Works lockup (≥180px wide), a hairline, then the product name.
  const lockupWidth = drawLogo(L.page, lockup, MARGIN, PAGE[1] - 32, 23);
  if (lockupWidth) {
    L.page.drawLine({ start: { x: MARGIN + lockupWidth + 9, y: PAGE[1] - 36 }, end: { x: MARGIN + lockupWidth + 9, y: PAGE[1] - 51 }, thickness: 0.75, color: C.ink, opacity: 0.35 });
    drawText(L.page, "Events", MARGIN + lockupWidth + 18, PAGE[1] - 48, T.heading(12.5));
  } else {
    drawText(L.page, "Space Works Events", MARGIN, PAGE[1] - 48, T.heading(13));
  }
  const reportLabel = metrics.targetType === "occurrence" ? "SERIES DATE REPORT" : "EVENT REPORT";
  drawText(L.page, reportLabel, PAGE[0] - MARGIN - textWidth(reportLabel, T.overline()), PAGE[1] - 48, T.overline());
  let bandY = PAGE[1] - 96;
  drawText(L.page, fit(metrics.organisationName, T.strong(11.5, C.textSecondary), CONTENT_WIDTH), MARGIN, bandY, T.strong(11.5, C.textSecondary));
  bandY -= 6;
  for (const line of titleLines) {
    bandY -= titleStyle.size * 1.04;
    drawText(L.page, line, MARGIN, bandY, titleStyle);
  }
  if (tagline) drawText(L.page, tagline, MARGIN, bandY - 22, T.body(11.5));
  L.y = PAGE[1] - bandHeight - 26;

  // Date block, as on the event page: accent header, big day number.
  const block = formatDateBlock(metrics.startDateTime, tz);
  box(L.page, MARGIN, L.y, 58, 64, { fill: C.canvas, border: C.border, radius: 10 });
  L.page.drawSvgPath("M 10 0 H 48 Q 58 0 58 10 V 18 H 0 V 10 Q 0 0 10 0 Z", { x: MARGIN, y: L.y, color: A.solid });
  drawText(L.page, block.month, MARGIN + 29 - textWidth(block.month, T.overline(A.on)) / 2, L.y - 13, T.overline(A.on));
  drawText(L.page, block.day, MARGIN + 29 - textWidth(block.day, T.display(24)) / 2, L.y - 50, T.display(24));
  const durationMinutes = Math.round((metrics.endDateTime.getTime() - metrics.startDateTime.getTime()) / 60_000);
  const duration = durationMinutes >= 1440
    ? plural(Math.round(durationMinutes / 1440), "day")
    : [Math.floor(durationMinutes / 60) ? plural(Math.floor(durationMinutes / 60), "hour") : "", durationMinutes % 60 ? `${durationMinutes % 60} min` : ""].filter(Boolean).join(" ");
  const place = metrics.isOnline ? "Online event" : [metrics.venueName, metrics.location].filter((part) => part?.trim()).join(", ");
  // A reference date in another year makes formatDayLong include the year, which a record should always show.
  drawText(L.page, formatDayLong(metrics.startDateTime, tz, new Date(0)), MARGIN + 74, L.y - 16, T.strong(12));
  drawText(L.page, `${formatTimeRange(metrics.startDateTime, metrics.endDateTime, tz)}  ·  ${duration}`, MARGIN + 74, L.y - 34, T.body(10.5));
  if (place) drawText(L.page, fit(place, T.body(10.5), CONTENT_WIDTH - 74), MARGIN + 74, L.y - 51, T.body(10.5));
  L.y -= 84;

  const summary = metrics.total === 0
    ? "Nobody signed up for this event through Space Works Events."
    : `${plural(metrics.total, "person", "people")} signed up and ${metrics.confirmed.toLocaleString("en-GB")} had a place on the day. ${metrics.checkedIn ? `${metrics.checkedIn.toLocaleString("en-GB")} of them were checked in at the door (${percentLabel(metrics.checkedIn, metrics.confirmed)})` : "Nobody was checked in with Space Works Events"}${metrics.feedbackResponseCount ? `, and ${plural(metrics.feedbackResponseCount, "person", "people")} shared feedback afterwards` : ""}.`;
  paragraph(summary, T.body(11.5, C.textSecondary), CONTENT_WIDTH, MARGIN, 10);

  const detailRows: Array<[string, string]> = [
    ["Visibility", PRIVACY[metrics.privacyType ?? "PUBLIC"] ?? "Public"],
    ["Capacity", metrics.capacity == null ? "No limit" : plural(metrics.capacity, "place")],
  ];
  if (metrics.registrationClosesAt) detailRows.push(["Registration closed", `${formatDate(metrics.registrationClosesAt, tz)}, ${formatTime(metrics.registrationClosesAt, tz)}`]);
  if (metrics.tags?.length) detailRows.push(["Tags", metrics.tags.join(", ")]);
  facts(detailRows);

  const tileRow = (items: Array<{ label: string; value: string; detail?: string }>, height: number, valueSize: number) => {
    const gap = 10;
    const width = (CONTENT_WIDTH - gap * (items.length - 1)) / items.length;
    ensure(height + 12);
    items.forEach((tile, index) => {
      const x = MARGIN + index * (width + gap);
      box(L.page, x, L.y, width, height, { fill: C.muted, radius: 14 });
      drawText(L.page, fit(tile.label, T.strong(9, C.textMuted), width - 24), x + 12, L.y - 19, T.strong(9, C.textMuted));
      drawText(L.page, fit(tile.value, T.display(valueSize), width - 24), x + 12, L.y - 19 - valueSize * 1.15, T.display(valueSize));
      if (tile.detail) drawText(L.page, fit(tile.detail, T.body(8.5, C.textMuted), width - 24), x + 12, L.y - height + 14, T.body(8.5, C.textMuted));
    });
    L.y -= height + 10;
  };
  const count = (value: number | undefined | null) => (value == null ? "–" : value.toLocaleString("en-GB"));

  L.y -= 4;
  ensure(40);
  drawText(L.page, "ATTENDANCE", MARGIN, L.y - 8, T.overline());
  L.y -= 20;
  tileRow([
    { label: "Signed up", value: count(metrics.total), detail: metrics.capacity ? `for ${plural(metrics.capacity, "place")}` : "no capacity limit" },
    { label: "Going", value: count(metrics.confirmed), detail: `${count(metrics.waitlisted)} on the waitlist` },
    { label: "Checked in", value: count(metrics.checkedIn), detail: `${percentLabel(metrics.checkedIn, metrics.confirmed)} of people going` },
    { label: "Feedback", value: count(metrics.feedbackResponseCount), detail: metrics.feedbackResponseCount == null ? "not collected" : `${percentLabel(metrics.feedbackResponseCount, metrics.checkedIn || metrics.confirmed)} response rate` },
  ], 84, 28);

  const sessionList = metrics.sessions ?? [];
  const totalSessionMinutes = sessionList.filter((session) => session.type.toLowerCase() !== "break").reduce((sum, session) => sum + (session.end.getTime() - session.start.getTime()) / 60_000, 0);
  L.y -= 6;
  ensure(40);
  drawText(L.page, "THE EVENT", MARGIN, L.y - 8, T.overline());
  L.y -= 20;
  tileRow([
    { label: "Sessions", value: count(sessionList.length), detail: totalSessionMinutes ? `${Math.round((totalSessionMinutes / 60) * 10) / 10} h of content` : undefined },
    { label: "Speakers", value: count(metrics.speakers?.length ?? 0) },
    { label: "Tracks", value: count(new Set(sessionList.map((session) => session.track)).size) },
    { label: "Sponsors", value: count(metrics.sponsors?.length ?? 0) },
    { label: "Resources", value: count(metrics.resourceCount ?? 0) },
  ], 74, 22);
  tileRow([
    { label: "Emails sent", value: metrics.targetType === "occurrence" ? "–" : count(metrics.broadcasts?.length ?? 0) },
    { label: "Invitations", value: count(metrics.invitationCount) },
    { label: "Sign-up form", value: count(metrics.registrationQuestions?.length ?? 0), detail: "questions" },
    { label: "Feedback form", value: count(metrics.feedbackQuestions?.length ?? 0), detail: "questions" },
    { label: "Co-organisers", value: count(metrics.coOrganiserCount ?? 0) },
  ], 74, 22);
}
