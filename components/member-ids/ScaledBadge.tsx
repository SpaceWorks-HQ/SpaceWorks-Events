"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCanvas } from "@/components/checkin/id-card/BadgeCanvas";
import type { IdCardPrintSettings } from "@/lib/idCardPrint";
import type { BadgeBranding, IdCardAttendee } from "@/lib/badge/types";

/** A static card side that fills its container's width, drawn by the shared badge canvas. */
export function ScaledBadge({ settings, person, branding }: { settings: IdCardPrintSettings; person: IdCardAttendee; branding: BadgeBranding }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="size-full">
      {width > 0 ? <BadgeCanvas settings={settings} attendee={person} branding={branding} pxPerMm={width / settings.widthMm} /> : null}
    </div>
  );
}
