import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/badge", () => ({ saveBadgeDesign: vi.fn() }));

import { useIdCardSettings, type BadgeDesignSource } from "@/components/checkin/id-card/shared";
import { defaultIdCardPrintSettings } from "@/lib/idCardPrint";

function Paper({ source }: { source: BadgeDesignSource }) {
  const { settings } = useIdCardSettings(source);
  return createElement("p", null, `${settings.template} ${settings.widthMm}x${settings.heightMm}`);
}

function source(template: "classic" | "bold", widthMm: number, heightMm: number, updatedAt: string): BadgeDesignSource {
  const settings = { ...defaultIdCardPrintSettings("Door Night", "Space Works"), template, widthMm, heightMm };
  return { eventId: "event_1", organisationSlug: "org", eventTitle: "Door Night", organisationName: "Space Works", canSave: true, design: { settings, saved: true, updatedAt } };
}

describe("badge design on the server", () => {
  it("renders each request's saved design, not one cached from an earlier render", () => {
    expect(renderToStaticMarkup(createElement(Paper, { source: source("classic", 105, 148, "2026-01-01T00:00:00.000Z") }))).toContain("classic 105x148");
    expect(renderToStaticMarkup(createElement(Paper, { source: source("bold", 85.6, 54, "2026-01-02T00:00:00.000Z") }))).toContain("bold 85.6x54");
  });
});
