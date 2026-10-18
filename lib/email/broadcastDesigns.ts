import { getAccentTokens, normalizeAccentHex, DEFAULT_EVENT_ACCENT } from "@/lib/theme/accent";
import { EMAIL_COLORS, EMAIL_FONT } from "./brand";

/*
 * Visual designs for organiser broadcasts. The content (sanitised HTML with
 * placeholders already rendered) is the same for every design; a design only
 * changes the frame around it and the inline styles applied to it. Pure and
 * free of server imports so it can be unit tested; every organiser-supplied
 * value is escaped or validated before it reaches the markup.
 */

export const BROADCAST_DESIGNS = [
  { id: "classic", name: "Classic", description: "Deep ink header with your organisation's name." },
  { id: "minimal", name: "Minimal", description: "Plain and quiet, like a personal note." },
  { id: "accent", name: "Accent band", description: "A bold header in the event's colour." },
  { id: "photo", name: "Photo header", description: "Leads with the event's cover photo." },
  { id: "letter", name: "Letter", description: "Warm cream paper and a serif heading." },
] as const;

export type BroadcastDesignId = (typeof BROADCAST_DESIGNS)[number]["id"];
export const BROADCAST_DESIGN_IDS = BROADCAST_DESIGNS.map((design) => design.id) as [BroadcastDesignId, ...BroadcastDesignId[]];
export const DEFAULT_BROADCAST_DESIGN: BroadcastDesignId = "classic";

export function isBroadcastDesign(value: unknown): value is BroadcastDesignId {
  return typeof value === "string" && (BROADCAST_DESIGN_IDS as readonly string[]).includes(value);
}

/** Event branding a design may use. All optional; designs fall back gracefully. */
export type BroadcastBrand = {
  accentColor?: string | null;
  coverImageUrl?: string | null;
  logoUrl?: string | null;
  /** e.g. "Sun 14 Oct 2035, 9:30 AM IST" */
  dateLine?: string | null;
  eventUrl?: string | null;
};

type Palette = {
  text: string;
  heading: string;
  muted: string;
  link: string;
  buttonBg: string;
  buttonText: string;
  quoteBorder: string;
  quoteBg: string;
  headingFont?: string;
};

const SANS = EMAIL_FONT;
const SERIF = "Georgia, 'Times New Roman', Times, serif";

/** Space Works palette: Deep Ink text, Maker Teal links and buttons with cream labels. */
const CLASSIC: Palette = {
  text: EMAIL_COLORS.ink,
  heading: EMAIL_COLORS.ink,
  muted: EMAIL_COLORS.inkMuted,
  link: EMAIL_COLORS.teal,
  buttonBg: EMAIL_COLORS.teal,
  buttonText: EMAIL_COLORS.cream,
  quoteBorder: EMAIL_COLORS.teal,
  quoteBg: EMAIL_COLORS.cream,
};

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Only http(s) URLs reach an email. Site-relative paths ("/api/uploads/…")
 * are made absolute with `baseUrl` (the public site address). With
 * `baseUrl === ""` (the dashboard preview, which renders inside the site) they
 * stay relative; with `null` (no public address configured) they are dropped
 * rather than sent as a link nobody can open.
 */
export function safeEmailUrl(value: string | null | undefined, baseUrl: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    if (baseUrl === null) return null;
    if (baseUrl === "") return /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(raw) ? raw : null;
    return safeEmailUrl(`${baseUrl.replace(/\/$/, "")}${raw}`, null);
  }
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function blockStyles(p: Palette): Record<string, string> {
  const headingFont = p.headingFont ? ` font-family: ${p.headingFont};` : "";
  return {
    p: `margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: ${p.text};`,
    h2: `margin: 24px 0 12px; font-size: 22px; line-height: 1.3; color: ${p.heading};${headingFont}`,
    h3: `margin: 20px 0 8px; font-size: 18px; line-height: 1.35; color: ${p.heading};${headingFont}`,
    ul: "margin: 0 0 16px; padding-left: 24px;",
    ol: "margin: 0 0 16px; padding-left: 24px;",
    li: `margin: 0 0 6px; font-size: 16px; line-height: 1.6; color: ${p.text};`,
    blockquote: `margin: 0 0 16px; padding: 10px 16px; border-left: 4px solid ${p.quoteBorder}; background: ${p.quoteBg}; color: ${p.muted};`,
  };
}

/** Mail clients ignore stylesheets, so the sanitised subset is styled inline. */
export function inlineBroadcastStyles(html: string, palette: Palette = CLASSIC): string {
  const styles = blockStyles(palette);
  const linkStyle = `color: ${palette.link}; text-decoration: underline; overflow-wrap: anywhere;`;
  const buttonStyle = `display: inline-block; background-color: ${palette.buttonBg}; color: ${palette.buttonText}; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;`;
  return html
    .replace(/<a\b([^>]*)>/g, (_match, attributes: string) => {
      const href = attributes.match(/href="([^"]*)"/)?.[1] ?? "";
      const isButton = /class="[^"]*\bcta\b[^"]*"/.test(attributes);
      return `<a href="${href}" style="${isButton ? buttonStyle : linkStyle}">`;
    })
    .replace(/<(p|h2|h3|ul|ol|li|blockquote)>/g, (_match, tag: string) => `<${tag} style="${styles[tag]}">`)
    .replace(/<p style="([^"]*)"><\/p>/g, '<p style="$1"><br></p>')
    .replace(/(<li style="[^"]*">)<p style="[^"]*">/g, `$1<p style="margin: 0; font-size: 16px; line-height: 1.6; color: ${palette.text};">`);
}

function accentPalette(accentColor: string | null | undefined, extra: Partial<Palette> = {}): { palette: Palette; accent: string; onAccent: string } {
  const accent = normalizeAccentHex(accentColor, DEFAULT_EVENT_ACCENT);
  const tokens = getAccentTokens(accent, "light");
  return {
    accent,
    onAccent: tokens["--yy-on-accent"],
    palette: {
      ...CLASSIC,
      link: tokens["--yy-accent-text"],
      buttonBg: accent,
      buttonText: tokens["--yy-on-accent"],
      quoteBorder: accent,
      quoteBg: tokens["--yy-accent-soft"],
      ...extra,
    },
  };
}

type FrameInput = {
  subject: string;
  bodyHtml: string;
  eventTitle: string;
  organisationName: string;
  brand: BroadcastBrand;
  /** Public site address for site-relative images; "" keeps them relative (preview); null drops them. */
  baseUrl: string | null;
};

function document(title: string, bodyStyle: string, inner: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
      <body style="${bodyStyle}">
        ${inner}
      </body>
    </html>
  `;
}

function footerText(eventTitle: string, organisationName: string): string {
  return `You are receiving this because you registered for ${escapeHtml(eventTitle)} with ${escapeHtml(organisationName)}.`;
}

function eventLink(brand: BroadcastBrand, baseUrl: string | null, color: string): string {
  const url = safeEmailUrl(brand.eventUrl, baseUrl);
  return url ? `<br><a href="${escapeHtml(url)}" style="color: ${color}; text-decoration: underline;">View the event page</a>` : "";
}

function classic(input: FrameInput): string {
  const title = escapeHtml(input.eventTitle);
  const org = escapeHtml(input.organisationName);
  return document(
    input.subject,
    `font-family: ${SANS}; background-color: ${EMAIL_COLORS.cream}; margin: 0; padding: 20px; color: ${EMAIL_COLORS.ink};`,
    `<div style="max-width: 600px; margin: 24px auto; background-color: ${EMAIL_COLORS.panel}; border-radius: 16px; border: 1px solid ${EMAIL_COLORS.line}; overflow: hidden;">
          <div style="background-color: ${EMAIL_COLORS.ink}; padding: 24px; text-align: center; color: ${EMAIL_COLORS.cream};">
            <h1 style="margin: 0; font-size: 20px; font-weight: 600;">${org}</h1>
            <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.85;">${title}</p>
          </div>
          <div style="padding: 32px;">${inlineBroadcastStyles(input.bodyHtml)}</div>
          <div style="background-color: ${EMAIL_COLORS.cream}; padding: 16px; text-align: center; font-size: 12px; color: ${EMAIL_COLORS.inkMuted}; border-top: 1px solid ${EMAIL_COLORS.line};">
            You are receiving this because you registered for ${title} with ${org}.<br>
            Sent through Space Works Events.
          </div>
        </div>`,
  );
}

function minimal(input: FrameInput): string {
  const org = escapeHtml(input.organisationName);
  const logo = safeEmailUrl(input.brand.logoUrl, input.baseUrl);
  const mark = logo
    ? `<img src="${escapeHtml(logo)}" alt="${org}" height="32" style="display: block; height: 32px; width: auto; border: 0; margin: 0 0 8px;">`
    : "";
  return document(
    input.subject,
    `font-family: ${SANS}; background-color: ${EMAIL_COLORS.panel}; margin: 0; padding: 20px; color: ${EMAIL_COLORS.ink};`,
    `<div style="max-width: 560px; margin: 16px auto;">
          <div style="padding: 0 0 20px; border-bottom: 1px solid ${EMAIL_COLORS.line}; margin-bottom: 28px;">
            ${mark}<p style="margin: 0; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: ${EMAIL_COLORS.inkMuted};">${org}</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: ${EMAIL_COLORS.inkMuted};">${escapeHtml(input.eventTitle)}</p>
          </div>
          <div>${inlineBroadcastStyles(input.bodyHtml)}</div>
          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid ${EMAIL_COLORS.line}; font-size: 12px; line-height: 1.6; color: ${EMAIL_COLORS.inkMuted};">
            ${footerText(input.eventTitle, input.organisationName)}${eventLink(input.brand, input.baseUrl, EMAIL_COLORS.teal)}
          </div>
        </div>`,
  );
}

function accentBand(input: FrameInput, withPhoto: boolean): string {
  const { palette, accent, onAccent } = accentPalette(input.brand.accentColor);
  const org = escapeHtml(input.organisationName);
  const title = escapeHtml(input.eventTitle);
  const date = input.brand.dateLine ? `<p style="margin: 10px 0 0; font-size: 14px; opacity: 0.9;">${escapeHtml(input.brand.dateLine)}</p>` : "";
  const cover = withPhoto ? safeEmailUrl(input.brand.coverImageUrl, input.baseUrl) : null;
  // The photo design leads with the cover; without one it falls back to the accent band.
  const header = cover
    ? `<img src="${escapeHtml(cover)}" alt="" width="600" style="display: block; width: 100%; max-width: 600px; height: auto; border: 0;">
          <div style="padding: 24px 32px 0;">
            <p style="margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${palette.link};">${org}</p>
            <h1 style="margin: 6px 0 0; font-size: 26px; line-height: 1.2; color: ${EMAIL_COLORS.ink};">${title}</h1>
            ${input.brand.dateLine ? `<p style="margin: 8px 0 0; font-size: 14px; color: ${EMAIL_COLORS.inkMuted};">${escapeHtml(input.brand.dateLine)}</p>` : ""}
          </div>`
    : `<div style="background-color: ${accent}; color: ${onAccent}; padding: 32px;">
            <p style="margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.85;">${org}</p>
            <h1 style="margin: 8px 0 0; font-size: 28px; line-height: 1.2;">${title}</h1>
            ${date}
          </div>`;
  return document(
    input.subject,
    `font-family: ${SANS}; background-color: ${EMAIL_COLORS.cream}; margin: 0; padding: 20px; color: ${EMAIL_COLORS.ink};`,
    `<div style="max-width: 600px; margin: 24px auto; background-color: ${EMAIL_COLORS.panel}; border-radius: 16px; border: 1px solid ${EMAIL_COLORS.line}; overflow: hidden;">
          ${header}
          <div style="padding: 28px 32px 32px;">${inlineBroadcastStyles(input.bodyHtml, palette)}</div>
          <div style="padding: 18px 32px; font-size: 12px; line-height: 1.6; color: ${EMAIL_COLORS.inkMuted}; border-top: 1px solid ${EMAIL_COLORS.line};">
            ${footerText(input.eventTitle, input.organisationName)}${eventLink(input.brand, input.baseUrl, palette.link)}
          </div>
        </div>`,
  );
}

function letter(input: FrameInput): string {
  const { palette } = accentPalette(input.brand.accentColor, { headingFont: SERIF, quoteBg: EMAIL_COLORS.panel });
  const org = escapeHtml(input.organisationName);
  const logo = safeEmailUrl(input.brand.logoUrl, input.baseUrl);
  const mark = logo ? `<img src="${escapeHtml(logo)}" alt="${org}" height="40" style="display: inline-block; height: 40px; width: auto; border: 0; margin-bottom: 10px;">` : "";
  return document(
    input.subject,
    `font-family: ${SANS}; background-color: ${EMAIL_COLORS.line}; margin: 0; padding: 20px; color: ${EMAIL_COLORS.ink};`,
    `<div style="max-width: 580px; margin: 24px auto; background-color: ${EMAIL_COLORS.cream}; border: 1px solid ${EMAIL_COLORS.line}; border-radius: 16px; padding: 40px 40px 32px;">
          <div style="text-align: center; padding-bottom: 24px; margin-bottom: 28px; border-bottom: 1px solid ${EMAIL_COLORS.line};">
            ${mark}
            <p style="margin: 0; font-family: ${SERIF}; font-size: 22px; color: ${EMAIL_COLORS.ink};">${escapeHtml(input.eventTitle)}</p>
            <p style="margin: 6px 0 0; font-size: 13px; color: ${EMAIL_COLORS.inkMuted};">${org}${input.brand.dateLine ? ` · ${escapeHtml(input.brand.dateLine)}` : ""}</p>
          </div>
          <div>${inlineBroadcastStyles(input.bodyHtml, palette)}</div>
          <p style="margin: 28px 0 0; font-family: ${SERIF}; font-size: 16px; font-style: italic; color: ${EMAIL_COLORS.inkMuted};">— ${org}</p>
          <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid ${EMAIL_COLORS.line}; font-size: 12px; line-height: 1.6; color: ${EMAIL_COLORS.inkMuted}; text-align: center;">
            ${footerText(input.eventTitle, input.organisationName)}${eventLink(input.brand, input.baseUrl, palette.link)}
          </div>
        </div>`,
  );
}

/** The HTML frame for a broadcast in the chosen design. */
export function renderBroadcastDesign(design: BroadcastDesignId, input: FrameInput): string {
  switch (design) {
    case "minimal":
      return minimal(input);
    case "accent":
      return accentBand(input, false);
    case "photo":
      return accentBand(input, true);
    case "letter":
      return letter(input);
    default:
      return classic(input);
  }
}
