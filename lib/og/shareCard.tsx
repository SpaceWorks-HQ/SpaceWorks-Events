import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { normalizeAccentHex } from "@/lib/theme/accent";

/** Social share card size (1200×630). */
export const SHARE_CARD_SIZE = { width: 1200, height: 630 };

const INK = "#142C2A";
const TEAL = "#006E63";
const CREAM = "#FFF4E8";

const BRAND_DIR = path.join(process.cwd(), "public", "brand");

let assets: Promise<{ lockup: string; medium: Buffer; semibold: Buffer }> | null = null;

/**
 * The full-colour horizontal lockup (public/brand/logo, as a data URI) and the
 * Gilroy faces, read from disk once per server process. next/og (satori)
 * reads WOFF, so the site's own font files are used as they are.
 */
function loadAssets() {
  assets ??= Promise.all([
    readFile(path.join(BRAND_DIR, "logo", "lockup-horizontal.svg")),
    readFile(path.join(BRAND_DIR, "fonts", "Gilroy-Medium.woff")),
    readFile(path.join(BRAND_DIR, "fonts", "Gilroy-SemiBold.woff")),
  ]).then(([svg, medium, semibold]) => ({ lockup: `data:image/svg+xml;base64,${svg.toString("base64")}`, medium, semibold }));
  return assets;
}

/**
 * The Space Works Events share card for public event links: Warm Cream, the
 * Space Works lockup, the event title and details in Deep Ink, an optional
 * stripe in the event's accent colour, and a teal register pill when
 * registration is public.
 */
export async function shareCardResponse({ title, detail, showRegister, accentColor }: { title: string; detail: string; showRegister: boolean; accentColor?: string | null }) {
  const { lockup, medium, semibold } = await loadAssets();
  const accent = accentColor ? normalizeAccentHex(accentColor, TEAL) : null;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: CREAM, color: INK, fontFamily: "Gilroy" }}>
        {accent ? <div style={{ display: "flex", width: 24, height: "100%", background: accent }} /> : null}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> */}
            <img src={lockup} width={298} height={48} alt="Space Works" />
            <div style={{ display: "flex", width: 2, height: 30, background: INK, opacity: 0.25 }} />
            <div style={{ display: "flex", fontSize: 26, fontWeight: 600 }}>Events</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", fontSize: title.length > 48 ? 60 : 72, fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.02em" }}>{title}</div>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 500, opacity: 0.78 }}>{detail}</div>
          </div>
          {showRegister ? (
            <div style={{ display: "flex", alignSelf: "flex-start", background: TEAL, color: CREAM, borderRadius: 12, padding: "16px 28px", fontSize: 26, fontWeight: 600 }}>Register for free</div>
          ) : (
            <div style={{ display: "flex", height: 1 }} />
          )}
        </div>
      </div>
    ),
    {
      ...SHARE_CARD_SIZE,
      fonts: [
        { name: "Gilroy", data: medium, weight: 500, style: "normal" },
        { name: "Gilroy", data: semibold, weight: 600, style: "normal" },
      ],
    },
  );
}
