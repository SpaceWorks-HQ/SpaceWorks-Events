import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DotGrid } from "@/components/brand/DotGrid";
import { DotMark } from "@/components/brand/DotMark";
import { DotFace } from "@/components/brand/DotFace";
import { DotIcon } from "@/components/brand/DotIcon";
import { FACES, FACE_MOODS, ICONS, ICON_NAMES, MARK, MARK_BRIGHT, parsePattern } from "@/components/brand/patterns";

const cells = (html: string) => html.match(/<span (?:class="[^"]*" )?style="border-radius:50%[^"]*"><\/span>/g) ?? [];

describe("dot sign patterns", () => {
  it("draws the Y on a 5×5 grid with six marigold dots and one ink host", () => {
    const grid = parsePattern(MARK);
    expect(grid).toHaveLength(5);
    expect(grid.every((row) => row.length === 5)).toBe(true);
    expect(MARK).toBe("X...X|.X.X.|..X..|..X..|..O..");
    expect(MARK.split("").filter((c) => c === "X")).toHaveLength(6);
    expect(MARK.split("").filter((c) => c === "O")).toHaveLength(1);
    expect(MARK_BRIGHT.replaceAll(" ", ".")).toBe(MARK);
  });

  it("keeps every face and icon on a 7×7 grid", () => {
    for (const mood of FACE_MOODS) expect(parsePattern(FACES[mood]).map((row) => row.length)).toEqual([7, 7, 7, 7, 7, 7, 7]);
    for (const icon of ICON_NAMES) expect(parsePattern(ICONS[icon]).map((row) => row.length)).toEqual([7, 7, 7, 7, 7, 7, 7]);
  });
});

describe("DotGrid", () => {
  it("renders one round cell per position with a quarter-dot gap and is decorative by default", () => {
    const html = renderToStaticMarkup(createElement(DotGrid, { pattern: "X.|O ", dot: 8 }));
    expect(cells(html)).toHaveLength(4);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
    expect(html).toContain("grid-template-columns:repeat(2, 8px)");
    expect(html).toContain("gap:2px");
    expect(html).toContain("background-color:var(--yy-brand-marigold)");
    expect(html).toContain("background-color:var(--yy-brand-dot-base)");
    expect(html).toContain("background-color:var(--yy-brand-dot-off)");
    expect(html).toContain("background-color:transparent");
  });

  it("is an image with an accessible name when labelled", () => {
    const html = renderToStaticMarkup(createElement(DotGrid, { pattern: MARK, dot: 6, label: "Yuyu" }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Yuyu"');
    expect(html).not.toContain("aria-hidden");
  });

  it("uses only circles and brand tokens (no gradients or other hues)", () => {
    const html = renderToStaticMarkup(createElement(DotMark, { size: 64 }));
    expect(html).not.toMatch(/gradient|#7EE8C4|#B9AEFF/i);
    expect(cells(html)).toHaveLength(25);
  });
});

describe("DotMark", () => {
  it("uses the full grid at 48px and bright dots only below", () => {
    expect(renderToStaticMarkup(createElement(DotMark, { size: 48 }))).toContain("var(--yy-brand-dot-off)");
    const small = renderToStaticMarkup(createElement(DotMark, { size: 40 }));
    expect(small).not.toContain("var(--yy-brand-dot-off)");
    expect(small).toContain("var(--yy-brand-marigold)");
  });

  it("switches bright dots to deep marigold under 32px and never goes below 16px", () => {
    expect(renderToStaticMarkup(createElement(DotMark, { size: 24 }))).toContain("var(--yy-brand-marigold-small)");
    expect(renderToStaticMarkup(createElement(DotMark, { size: 8 }))).toContain("width:16px");
  });

  it("names itself Yuyu unless a wordmark already does", () => {
    expect(renderToStaticMarkup(createElement(DotMark, {}))).toContain('aria-label="Yuyu"');
    expect(renderToStaticMarkup(createElement(DotMark, { label: null }))).toContain('aria-hidden="true"');
  });

  it("renders mono in the current colour", () => {
    const html = renderToStaticMarkup(createElement(DotMark, { size: 64, variant: "mono" }));
    expect(html).toContain("background-color:currentColor");
    expect(html).not.toContain("var(--yy-brand-marigold)");
  });
});

describe("DotFace and DotIcon", () => {
  it("render their Figma patterns", () => {
    expect(cells(renderToStaticMarkup(createElement(DotFace, { mood: "sleepy", size: 85 })))).toHaveLength(49);
    expect(cells(renderToStaticMarkup(createElement(DotIcon, { name: "date" })))).toHaveLength(49);
  });
});

describe("DotFace hover", () => {
  it("marks every dot for the ripple and only the eyes for the blink", () => {
    const html = renderToStaticMarkup(createElement(DotFace, { mood: "happy", size: 85 }));
    expect(html).toContain('class="yy-face');
    expect(html.match(/yy-face-dot/g)).toHaveLength(49);
    // Happy has two eyes on row 2.
    expect(html.match(/yy-face-eye/g)).toHaveLength(2);
    expect(html).toContain("--yy-face-delay:0ms");
  });

  it("skips the blink for faces without eyes and can be turned off", () => {
    expect(renderToStaticMarkup(createElement(DotFace, { mood: "love" }))).not.toContain("yy-face-eye");
    expect(renderToStaticMarkup(createElement(DotFace, { mood: "happy", hover: false }))).not.toContain("yy-face");
  });
});
