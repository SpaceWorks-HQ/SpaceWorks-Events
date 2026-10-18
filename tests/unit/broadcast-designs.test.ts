import { describe, expect, it } from "vitest";
import { BROADCAST_DESIGN_IDS, isBroadcastDesign, renderBroadcastDesign, safeEmailUrl } from "@/lib/email/broadcastDesigns";
import { sendEventBroadcastSchema } from "@/lib/validators";

const base = {
  subject: "Doors open at 6",
  bodyHtml: '<p>Hello</p><p><a class="cta" href="https://yuyu.test/t">Ticket</a></p>',
  eventTitle: "Demo <Summit>",
  organisationName: "Org & Co",
  baseUrl: "https://yuyu.test",
};

describe("broadcast designs", () => {
  it("renders every design with the content and escaped names", () => {
    for (const design of BROADCAST_DESIGN_IDS) {
      const html = renderBroadcastDesign(design, { ...base, brand: { accentColor: "#0EA5E9", dateLine: "Sun 14 Oct", eventUrl: "/org/demo" } });
      expect(html).toContain("Hello");
      expect(html).toContain("Demo &lt;Summit&gt;");
      expect(html).toContain("Org &amp; Co");
      expect(html).not.toContain("<Summit>");
    }
  });

  it("uses the event accent for buttons, with readable text on light colours", () => {
    const html = renderBroadcastDesign("accent", { ...base, brand: { accentColor: "#0EA5E9" } });
    expect(html).toContain("background-color: #0EA5E9; color: #18181B;");
    // Invalid accents never reach CSS.
    const bad = renderBroadcastDesign("accent", { ...base, brand: { accentColor: "red;background:url(x)" } });
    expect(bad).not.toContain("url(x)");
  });

  it("leads with the cover photo, or falls back to the accent band without one", () => {
    expect(renderBroadcastDesign("photo", { ...base, brand: { coverImageUrl: "/api/uploads/c.webp" } })).toContain('src="https://yuyu.test/api/uploads/c.webp"');
    const noCover = renderBroadcastDesign("photo", { ...base, brand: { coverImageUrl: "javascript:alert(1)" } });
    expect(noCover).not.toContain("javascript:");
    expect(noCover).not.toContain("<img");
  });

  it("keeps site images relative in the preview and drops them when no public address is set", () => {
    expect(safeEmailUrl("/api/uploads/a.webp", "")).toBe("/api/uploads/a.webp");
    expect(safeEmailUrl("/api/uploads/a.webp", null)).toBeNull();
    expect(safeEmailUrl('/x" onerror="y', "")).toBeNull();
    const noBase = renderBroadcastDesign("photo", { ...base, baseUrl: null, brand: { coverImageUrl: "/api/uploads/c.webp" } });
    expect(noBase).not.toContain("<img");
    const preview = renderBroadcastDesign("photo", { ...base, baseUrl: "", brand: { coverImageUrl: "/api/uploads/c.webp" } });
    expect(preview).toContain('src="/api/uploads/c.webp"');
  });

  it("only allows absolute http(s) URLs", () => {
    expect(safeEmailUrl("/x", "https://a.test/")).toBe("https://a.test/x");
    expect(safeEmailUrl("//evil.test/x", "https://a.test")).toBeNull();
    expect(safeEmailUrl("data:image/png;base64,AA", "https://a.test")).toBeNull();
    expect(safeEmailUrl('https://a.test/"onerror="x', "https://a.test")).toBe("https://a.test/%22onerror=%22x");
  });

  it("validates the design id everywhere it's accepted", () => {
    expect(isBroadcastDesign("letter")).toBe(true);
    expect(isBroadcastDesign("fancy")).toBe(false);
    const input = { organisationSlug: "o", eventId: "e", statuses: ["CONFIRMED"], subject: "Hi", body: "<p>x</p>" };
    expect(sendEventBroadcastSchema.parse(input).design).toBe("classic");
    expect(sendEventBroadcastSchema.safeParse({ ...input, design: "fancy" }).success).toBe(false);
  });
});
