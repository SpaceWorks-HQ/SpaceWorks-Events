/* ---------- The letter ---------- */

export const LETTER = {
  overline: "A note from the team",
  title: "Open doors. Open source.",
  intro: [
    "Space Works started as a room with workbenches and a kettle. People came to fix things, learn to solder and show each other what they were building.",
    "As the evenings grew, so did the admin. A sign-up form in one place, a spreadsheet in another, a guest list on paper at the door, and certificates made by hand the week after.",
    "We wanted one place for all of it, built for free community events rather than ticket sales. So we built Space Works Events, and we run our own nights on it first.",
  ],
  list: [
    "An event page in your community’s colours",
    "Registration, waitlists and live tickets",
    "Check-in at the door, even when the Wi-Fi drops",
    "Name badges and ID cards",
    "Feedback and certificates afterwards",
  ],
  outro: [
    "It is open source under the AGPL, so any makerspace, hack club or meetup can read the code, run its own copy and keep its guest list on its own server.",
    "If you run events for people who make things, we hope it gives you more evenings at the bench and fewer at the spreadsheet.",
  ],
  closing: ["Less admin.", "More making.", "See you at the next build night."],
  signature: "The Space Works team",
};

/* ---------- Materials (paper stays paper in both themes) ---------- */

// Brand paper and ink stay the same in both colour modes.
export const PAPER = "#FFF4E8";
export const PAPER_BACK = "#F6ECE0";
export const PAPER_LINE = "rgb(20 44 42 / 0.14)";
export const INK = "#142C2A";
export const HAIRLINE = "rgb(20 44 42 / 0.18)";
// An airmail envelope in Sky Blue, shaded only with brand cream and Deep Ink.
export const SKY = "#B5CDFF";
export const SKY_LIGHT = "color-mix(in srgb, #B5CDFF 62%, #FFF4E8)";
export const SKY_DEEP = "color-mix(in srgb, #B5CDFF 76%, #142C2A)";
export const ENVELOPE = `linear-gradient(160deg, ${SKY}, ${SKY_DEEP})`;
export const ENVELOPE_FLAP = `linear-gradient(172deg, ${SKY_LIGHT} 10%, ${SKY} 85%)`;
export const ENVELOPE_POCKET = `linear-gradient(12deg, ${SKY}, ${SKY_LIGHT})`;
export const ENVELOPE_SIDES = `linear-gradient(115deg, ${SKY}, ${SKY_DEEP})`;
export const FLAP_EDGE = "drop-shadow(0 1.5px 0 rgb(20 44 42 / 0.3))";
// Airmail stripes in Maker Teal along the edge of the envelope.
export const AIRMAIL = "repeating-linear-gradient(-45deg, #006E63 0 7px, #FFF4E8 7px 14px)";
// The inside of the flap: Maker Teal with a Citron dot lining.
export const LINER = "radial-gradient(circle, rgb(223 255 143 / 0.6) 1.4px, transparent 1.6px) 0 0 / 11px 11px, #006E63";
export const ENVELOPE_RATIO = 1.62;
export const FLAP_CLIP = "polygon(0 0, 100% 0, 50% 100%)";
export const FLAP_BACK_CLIP = "polygon(0 100%, 100% 100%, 50% 0)";

export const LAYOUT_ID = "building-note-envelope";
export type Phase = "closed" | "opening" | "reading" | "closing";

export const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
