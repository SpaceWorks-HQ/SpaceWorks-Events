import { readFile } from "node:fs/promises";
import path from "node:path";

/** Social share card size (Figma "Social share card 1200×630", node 114:1456). */
export const SHARE_CARD_SIZE = { width: 1200, height: 630 };

let lockupDataUri: Promise<string> | null = null;

/** The dark dot-sign lockup (public/brand/lockup-horizontal-dark.svg) as a data URI for next/og. */
function darkLockup(): Promise<string> {
  lockupDataUri ??= readFile(path.join(process.cwd(), "public", "brand", "lockup-horizontal-dark.svg"), "utf8").then(
    (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  );
  return lockupDataUri;
}

/**
 * Yuyu's share card for public event links: ink, the dot-sign lockup, the event
 * title and details, and a marigold register pill when registration is public.
 */
export async function ShareCard({ title, detail, showRegister }: { title: string; detail: string; showRegister: boolean }) {
  const lockup = await darkLockup();
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "#18181B", color: "#FFFFFF" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> */}
      <img src={lockup} width={176} height={52} alt="Yuyu" />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em" }}>{title}</div>
        <div style={{ display: "flex", fontSize: 30, color: "#D4D4D8" }}>{detail}</div>
      </div>
      {showRegister ? (
        <div style={{ display: "flex", alignSelf: "flex-start", background: "#FFB547", color: "#18181B", borderRadius: 999, padding: "16px 28px", fontSize: 26, fontWeight: 700 }}>Register — it’s free</div>
      ) : (
        <div style={{ display: "flex", height: 1 }} />
      )}
    </div>
  );
}
