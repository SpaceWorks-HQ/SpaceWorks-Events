"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { IdCardPrintSettings } from "@/lib/idCardPrint";
import type { BadgeBranding, IdCardAttendee } from "@/lib/badge/types";
import { BadgeCanvas, badgeFontFaceCss } from "./BadgeCanvas";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/** The card as static markup in real millimetres: the same component as the on-screen preview. */
function cardMarkup(settings: IdCardPrintSettings, attendee: IdCardAttendee, branding: BadgeBranding) {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(<BadgeCanvas settings={settings} attendee={attendee} branding={branding} unit="mm" />));
  const markup = container.innerHTML;
  root.unmount();
  return markup;
}

/**
 * Open a print window with one card sized exactly to the paper. Returns false
 * when the window is blocked. The QR is drawn locally; nothing leaves the
 * browser. Colours print exactly as designed; print-economy designs are
 * black on white for laser and thermal printers.
 */
export async function printCard(params: { settings: IdCardPrintSettings; attendee: IdCardAttendee; branding: BadgeBranding }) {
  const { settings, attendee, branding } = params;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.opener = null;

  let markup: string;
  try {
    markup = cardMarkup(settings, attendee, branding);
  } catch {
    printWindow.close();
    return false;
  }

  const origin = window.location.origin;
  printWindow.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><base href="${escapeHtml(origin)}/"><title>${escapeHtml(attendee.displayName)} badge</title><style>
  ${badgeFontFaceCss(origin)}
  @page { size: ${settings.widthMm}mm ${settings.heightMm}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: ${settings.widthMm}mm; height: ${settings.heightMm}mm; margin: 0; padding: 0; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  img { display: block; }
</style></head><body>${markup}</body></html>`);
  printWindow.document.close();
  printWindow.focus();

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    printWindow.print();
  };
  // Wait for the badge font and artwork, but never longer than two seconds.
  const images = Array.from(printWindow.document.images).filter((image) => !image.complete);
  const imagesLoaded = Promise.all(images.map((image) => new Promise<void>((resolve) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  })));
  const fonts = printWindow.document.fonts;
  const fontsLoaded = fonts
    ? Promise.all([400, 600, 700].map((weight) => fonts.load(`${weight} 12pt "SWE Badge Gilroy"`))).catch(() => undefined)
    : Promise.resolve();
  void Promise.all([imagesLoaded, fontsLoaded]).then(() => window.setTimeout(triggerPrint, 100));
  window.setTimeout(triggerPrint, 2000);
  return true;
}
