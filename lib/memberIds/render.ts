import "server-only";

import { loadBadgeFonts } from "@/lib/badge/fonts";
import { buildBadgeScene, type BadgeScene } from "@/lib/badge/layout";
import { renderBadgesPdf } from "@/lib/badge/renderPdf";
import { renderBadgePng } from "@/lib/badge/renderPng";
import type { BadgeBranding, IdCardAttendee } from "@/lib/badge/types";
import { sideSettings, type MemberIdDesign, type PlacedField } from "./design";
import { createZip } from "./zip";

/*
 * Member ID cards through the badge pipeline: the front and (when enabled)
 * the back are two scenes, so a single card is a two-page PDF and a batch
 * keeps front/back pairs together for duplex printing.
 */

/** One download holds at most this many cards; ZIPs are built in memory, so they stay smaller. */
export const MEMBER_ID_BULK_PDF_LIMIT = 500;
export const MEMBER_ID_BULK_ZIP_LIMIT = 200;

export type CardInput = { design: MemberIdDesign; fields: PlacedField[]; branding: BadgeBranding };

export async function memberCardScenes(input: CardInput, person: IdCardAttendee): Promise<BadgeScene[]> {
  const { measurer } = await loadBadgeFonts();
  const front = buildBadgeScene({ settings: sideSettings(input.design, "front", input.fields), attendee: person, branding: input.branding, measurer });
  if (!input.design.backEnabled) return [front];
  const back = buildBadgeScene({ settings: sideSettings(input.design, "back", input.fields), attendee: person, branding: input.branding, measurer });
  return [front, back];
}

/** A two-page PDF (front, back) or a 300 dpi PNG of either side. */
export async function renderMemberCard(input: CardInput, person: IdCardAttendee, format: "pdf" | "png", options: { side?: "front" | "back"; title: string }) {
  const scenes = await memberCardScenes(input, person);
  if (format === "png") return renderBadgePng(options.side === "back" && scenes[1] ? scenes[1] : scenes[0]!);
  return renderBadgesPdf(scenes, { layout: "card", title: options.title });
}

/** Every card in one PDF, front then back for each member. People are streamed in. */
export async function renderMemberCardsPdf(input: CardInput, people: AsyncIterable<IdCardAttendee>, title: string) {
  async function* scenes() {
    for await (const person of people) yield* await memberCardScenes(input, person);
  }
  return renderBadgesPdf(scenes(), { layout: "card", title });
}

/** A ZIP with one PDF per member, named `0001-name.pdf`. */
export async function renderMemberCardsZip(input: CardInput, people: AsyncIterable<IdCardAttendee>, fileName: (person: IdCardAttendee, index: number) => string) {
  const entries: Array<{ name: string; data: Uint8Array }> = [];
  let index = 0;
  for await (const person of people) {
    index += 1;
    const pdf = await renderBadgesPdf(await memberCardScenes(input, person), { layout: "card", title: `${person.displayName} ID card` });
    entries.push({ name: fileName(person, index), data: pdf });
  }
  return createZip(entries);
}
