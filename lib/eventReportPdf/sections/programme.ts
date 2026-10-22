import "server-only";

import type { EventReportMetrics } from "@/lib/eventReport";
import { formatDate, formatDayLong, formatTimeRange } from "@/lib/format/datetime";
import type { ReportLayout } from "../layout";
import { C, CONTENT_WIDTH, MARGIN, PAGE, SPONSOR_TIERS, plural } from "../style";

/** The published sessions, speakers and sponsors. */
export function drawProgramme(L: ReportLayout, metrics: EventReportMetrics, tz: string, now: Date) {
  const { A, T, clean, textWidth, drawText, fit, wrap, box, ensure, paragraph, section, subheading, facts } = L;
  // ---------- Programme ----------

  const sessions = metrics.sessions ?? [];
  const speakers = metrics.speakers ?? [];
  const sponsors = metrics.sponsors ?? [];
  if (sessions.length || speakers.length || sponsors.length) {
    section("What happened", "Programme", "The published sessions, speakers and sponsors, as they appeared on the event page.");

    if (sessions.length) {
      subheading("Sessions", `${plural(sessions.length, "session")}${new Set(sessions.map((s) => s.track)).size > 1 ? ` across ${new Set(sessions.map((s) => s.track)).size} tracks` : ""}.`);
      let day = "";
      for (const session of sessions) {
        const sessionDay = formatDayLong(session.start, tz, now);
        const multiDay = formatDate(sessions[0]!.start, tz) !== formatDate(sessions[sessions.length - 1]!.start, tz);
        if (multiDay && sessionDay !== day) {
          ensure(40);
          day = sessionDay;
          L.y -= 6;
          drawText(L.page, day.toUpperCase(), MARGIN, L.y - 8, T.overline(A.text));
          L.y -= 20;
        }
        const meta = [session.type, session.track, session.speakers.join(", ")].filter(Boolean).join("  ·  ");
        const titleLines = wrap(session.title, T.strong(10.5), CONTENT_WIDTH - 130);
        const metaLines = meta ? wrap(meta, T.body(9, C.textMuted), CONTENT_WIDTH - 130) : [];
        const height = titleLines.length * 15 + metaLines.length * 13 + (session.delayMinutes > 0 ? 24 : 0) + 14;
        ensure(height);
        drawText(L.page, formatTimeRange(session.start, session.end, tz, { withZone: false }), MARGIN, L.y - 11, T.strong(9.5, C.textSecondary));
        let rowY = L.y;
        for (const line of titleLines) {
          drawText(L.page, line, MARGIN + 130, rowY - 11, T.strong(10.5));
          rowY -= 15;
        }
        for (const line of metaLines) {
          drawText(L.page, line, MARGIN + 130, rowY - 9, T.body(9, C.textMuted));
          rowY -= 13;
        }
        if (session.delayMinutes > 0) {
          const label = `Ran ${session.delayMinutes} min late`;
          box(L.page, MARGIN + 130, rowY - 4, textWidth(label, T.strong(8.5)) + 16, 18, { fill: C.warningBg, radius: 9 });
          drawText(L.page, label, MARGIN + 138, rowY - 16, T.strong(8.5, C.warningFg));
          rowY -= 24;
        }
        L.y = rowY - 8;
        L.page.drawLine({ start: { x: MARGIN, y: L.y + 3 }, end: { x: PAGE[0] - MARGIN, y: L.y + 3 }, thickness: 0.5, color: C.border });
        L.y -= 6;
      }
      L.y -= 6;
    }

    if (speakers.length) {
      subheading("Speakers", `${plural(speakers.length, "speaker")}.`);
      const colWidth = (CONTENT_WIDTH - 20) / 2;
      for (let index = 0; index < speakers.length; index += 2) {
        ensure(40);
        speakers.slice(index, index + 2).forEach((speaker, column) => {
          const x = MARGIN + column * (colWidth + 20);
          const initial = clean(speaker.name).charAt(0).toUpperCase() || "?";
          L.page.drawCircle({ x: x + 14, y: L.y - 14, size: 14, color: A.soft });
          drawText(L.page, initial, x + 14 - textWidth(initial, T.heading(12, A.text)) / 2, L.y - 18, T.heading(12, A.text));
          drawText(L.page, fit(speaker.name, T.strong(10.5), colWidth - 40), x + 38, L.y - 11, T.strong(10.5));
          if (speaker.detail) drawText(L.page, fit(speaker.detail, T.body(9, C.textMuted), colWidth - 40), x + 38, L.y - 25, T.body(9, C.textMuted));
        });
        L.y -= 40;
      }
      L.y -= 4;
    }

    if (sponsors.length) {
      subheading("Sponsors and partners");
      const tiers = new Map<string, string[]>();
      for (const sponsor of sponsors) tiers.set(sponsor.tier, [...(tiers.get(sponsor.tier) ?? []), sponsor.name]);
      facts([...tiers].map(([tier, names]) => [SPONSOR_TIERS[tier] ?? tier, names.join(", ")]));
    }

    if (metrics.resourceCount) paragraph(`${plural(metrics.resourceCount, "resource")}, such as slides or links, ${metrics.resourceCount === 1 ? "was" : "were"} shared on the event page.`, T.body(10, C.textMuted));
  }
}
