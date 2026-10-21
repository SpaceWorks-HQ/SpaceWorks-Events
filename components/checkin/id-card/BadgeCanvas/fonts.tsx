/** The badge typeface, loaded from the brand web fonts so preview and print match the server renderer. */
export const BADGE_FONT_FAMILY = "\"SWE Badge Gilroy\", Gilroy, system-ui, sans-serif";

export function badgeFontFaceCss(origin = "") {
  return [["Regular", 400], ["SemiBold", 600], ["Bold", 700]]
    .map(([file, weight]) => `@font-face { font-family: "SWE Badge Gilroy"; src: url("${origin}/brand/fonts/Gilroy-${file}.woff") format("woff"); font-weight: ${weight}; font-style: normal; font-display: block; }`)
    .join("\n");
}

/** Include once wherever badges are drawn on screen. */
export function BadgeFontFaces() {
  return <style>{badgeFontFaceCss()}</style>;
}
