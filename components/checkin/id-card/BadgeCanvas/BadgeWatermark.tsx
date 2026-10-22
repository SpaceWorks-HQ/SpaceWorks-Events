import { watermarkSizePt, type IdCardPrintSettings } from "@/lib/idCardPrint";
import { watermarkImageBox } from "@/lib/badge/layout";
import type { resolveBadgePalette } from "@/lib/badge/palette";

/** The badge watermark: rotated text or an uploaded image, under everything else. */
export function BadgeWatermark({
  settings,
  palette,
  watermarkUrl,
  mono,
  px,
  ptPx,
}: {
  settings: IdCardPrintSettings;
  palette: ReturnType<typeof resolveBadgePalette>;
  watermarkUrl: string | null | undefined;
  mono: boolean;
  px: (mm: number) => string;
  ptPx: (pt: number) => string;
}) {
  const mark = settings.watermark;
  const markColour = mark.colour === "text" ? palette.text : palette.accent === palette.background ? palette.text : palette.accent;
  const markText = mark.kind === "text" ? mark.text.trim().toLocaleUpperCase("en") : "";
  const markBox = watermarkImageBox(settings.widthMm, settings.heightMm);

  return (
    <>
      {markText ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -50%) rotate(${mark.angleDeg}deg)`,
            fontSize: ptPx(watermarkSizePt(markText, settings.widthMm, settings.heightMm, mark.angleDeg)),
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            color: markColour,
            opacity: mark.opacityPct / 100,
            pointerEvents: "none",
          }}
        >
          {markText}
        </span>
      ) : null}
      {watermarkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- managed watermark upload drawn to scale
        <img
          aria-hidden
          src={watermarkUrl}
          alt=""
          draggable={false}
          style={{ position: "absolute", left: px(markBox.x), top: px(markBox.y), width: px(markBox.w), height: px(markBox.h), objectFit: "contain", opacity: mark.opacityPct / 100, filter: mono ? "grayscale(1)" : undefined, pointerEvents: "none" }}
        />
      ) : null}
    </>
  );
}
