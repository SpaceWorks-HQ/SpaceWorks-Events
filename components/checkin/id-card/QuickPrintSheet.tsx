"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import type { BadgeBranding } from "@/lib/badge/types";
import { BadgeCanvas, BadgeFontFaces } from "./BadgeCanvas";
import { printCard } from "./printCards";
import { type BadgeDesignSource, type IdCardAttendee, useIdCardSettings } from "./shared";

/**
 * The desk's everyday screen after a check-in: this person's real badge and
 * one big Print button (Enter prints). Design changes live one click away on
 * dashboard desks; PIN stations print the event's saved design as it is.
 */
export function QuickPrintSheet({
  source,
  branding,
  attendee,
  onEditDesign,
  onClose,
}: {
  source: BadgeDesignSource;
  branding: BadgeBranding;
  attendee: IdCardAttendee;
  onEditDesign: (() => void) | null;
  onClose: () => void;
}) {
  const { settings } = useIdCardSettings(source);
  const [state, setState] = useState<"idle" | "printing" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const printButton = useRef<HTMLButtonElement>(null);
  // Fit the card into roughly 300 × 300 px whatever the stock.
  const pxPerMm = Math.min(300 / settings.widthMm, 300 / settings.heightMm);

  useEffect(() => {
    printButton.current?.focus();
  }, []);

  const print = async () => {
    setState("printing");
    setError(null);
    try {
      const ok = await printCard({ settings, attendee, branding });
      if (ok) setState("sent");
      else {
        setState("error");
        setError("The print window was blocked. Allow pop-ups for this site and try again.");
      }
    } catch {
      setState("error");
      setError("The badge couldn't be prepared. Try again.");
    }
  };

  return (
    <div className="flex flex-col">
      <BadgeFontFaces />
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <figure className="flex shrink-0 justify-center rounded-[16px] bg-subtle p-4 sm:w-[340px]">
          <BadgeCanvas settings={settings} attendee={attendee} branding={branding} pxPerMm={pxPerMm} />
          <figcaption className="sr-only">Badge preview for {attendee.displayName}</figcaption>
        </figure>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div>
            <p className="text-overline text-ink-muted">Badge for</p>
            <h2 id="id-card-designer-title" className="text-h3 text-ink [overflow-wrap:anywhere]">{attendee.displayName}</h2>
            <p className="mt-1 text-caption text-ink-muted tabular-nums">
              {settings.widthMm} × {settings.heightMm} mm · print at 100% (actual size)
            </p>
          </div>
          {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
          {state === "sent" ? <Callout tone="success" role="status">Sent to the print window. Print again if it didn&apos;t come out.</Callout> : null}
          <div className="flex flex-col gap-2">
            <Button ref={printButton} variant="primary" size="lg" disabled={state === "printing"} onClick={print} className="w-full justify-center">
              {state === "printing" ? "Preparing…" : state === "sent" ? "Print again" : "Print badge"}
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose} className="flex-1 justify-center">
                {state === "sent" ? "Done" : "Skip"}
              </Button>
              {onEditDesign ? (
                <Button variant="quiet" onClick={onEditDesign} className="flex-1 justify-center">
                  Edit design
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
