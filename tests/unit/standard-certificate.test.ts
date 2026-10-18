import { describe, expect, it } from "vitest";
import { fittedFontSize, standardCertificateSvg } from "@/lib/renderCertificate";

const sizes = (svg: string) => [...svg.matchAll(/font-size="(\d+)"/g)].map((match) => Number(match[1]));

describe("standard certificate", () => {
  it("keeps short text at its design size and shrinks long text to fit the frame", () => {
    expect(fittedFontSize("Alex", 80, 1380, 0.62)).toBe(80);
    const long = "A".repeat(60);
    const size = fittedFontSize(long, 80, 1380, 0.62);
    expect(size).toBeLessThan(80);
    expect(60 * 0.62 * size).toBeLessThanOrEqual(1380);
  });

  it("sizes the heading, name and title so none is wider than the frame", () => {
    const svg = standardCertificateSvg({
      organisationName: "Space Works Kochi",
      attendee: "Alexandria Catherine Montgomery-Fitzgerald Ramakrishnan",
      eventTitle: "The Very Long Annual Community Hardware Hacking and Soldering Marathon",
      issuedAt: new Date("2026-10-15T10:00:00Z"),
    });
    const [, heading, , name, , title] = sizes(svg);
    expect(28 * 0.72 * heading!).toBeLessThanOrEqual(1380);
    expect(name).toBeLessThan(80);
    expect(title).toBeLessThan(62);
    expect(svg).toContain("Issued October 15, 2026");
  });

  it("escapes attendee and event text", () => {
    const svg = standardCertificateSvg({ organisationName: "A & B", attendee: "<script>", eventTitle: "\"Launch\"", issuedAt: new Date() });
    expect(svg).toContain("A &amp; B");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<script>");
  });
});
