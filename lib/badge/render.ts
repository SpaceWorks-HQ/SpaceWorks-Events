import "server-only";

import type { IdCardPrintSettings } from "@/lib/idCardPrint";
import { loadBadgeFonts } from "./fonts";
import { buildBadgeScene } from "./layout";
import { renderBadgesPdf, type BadgePdfLayout } from "./renderPdf";
import { renderBadgePng } from "./renderPng";
import type { BadgeBranding, IdCardAttendee } from "./types";

/** The badge pipeline: settings + attendee + branding → scene → PDF or PNG. */

export async function renderBadge(input: { settings: IdCardPrintSettings; attendee: IdCardAttendee; branding: BadgeBranding; format: "pdf" | "png"; title: string }) {
  const { measurer } = await loadBadgeFonts();
  const scene = buildBadgeScene({ settings: input.settings, attendee: input.attendee, branding: input.branding, measurer });
  if (input.format === "png") return renderBadgePng(scene);
  return renderBadgesPdf([scene], { layout: "card", title: input.title });
}

export async function renderBadgeBatch(input: {
  settings: IdCardPrintSettings;
  attendees: AsyncIterable<IdCardAttendee> | Iterable<IdCardAttendee>;
  branding: BadgeBranding;
  layout: BadgePdfLayout;
  title: string;
}) {
  const { measurer } = await loadBadgeFonts();
  async function* scenes() {
    for await (const attendee of input.attendees) {
      yield buildBadgeScene({ settings: input.settings, attendee, branding: input.branding, measurer });
    }
  }
  return renderBadgesPdf(scenes(), { layout: input.layout, title: input.title });
}
