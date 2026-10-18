"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * "Where it appears": the edited output shown with `object-cover` in boxes
 * that match the real components — the event page header (16:7,
 * EventWebsiteShell), dashboard/discover cards (140–150px tall on ~350px wide
 * cards, EventCard/DiscoverEventCard), and a social link preview (og:image,
 * 1.91:1).
 */
export function PlacementPreviews({ url, updating, className }: { url: string | null; updating?: boolean; className?: string }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="text-label text-ink">
          Where it appears
        </h3>
        <span aria-hidden className={cn("text-caption text-ink-muted transition-opacity duration-[180ms]", updating ? "opacity-100" : "opacity-0")}>
          Updating…
        </span>
      </div>
      <Preview label="Event page header" url={url} imageStyle={{ aspectRatio: "16 / 7" }} framed>
        <Bar className="w-3/5" strong />
        <Bar className="w-2/5" />
      </Preview>
      <div className="grid grid-cols-2 gap-3">
        <Preview label="Event card" url={url} imageStyle={{ aspectRatio: "2.45 / 1" }}>
          <Bar className="w-1/3" />
          <Bar className="w-4/5" strong />
          <Bar className="w-1/2" />
        </Preview>
        <Preview label="Social share" url={url} imageStyle={{ aspectRatio: "1.91 / 1" }}>
          <Bar className="w-2/5" />
          <Bar className="w-4/5" strong />
        </Preview>
      </div>
    </section>
  );
}

function Preview({ label, url, imageStyle, framed = false, children }: { label: string; url: string | null; imageStyle: CSSProperties; framed?: boolean; children: ReactNode }) {
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <div className={cn("overflow-hidden rounded-lg border border-line bg-canvas", framed && "p-2")}>
        {url ? (
          // Local blob preview of the editor output.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Preview: ${label.toLowerCase()}`} className={cn("block w-full bg-muted object-cover", framed && "rounded-md")} style={imageStyle} />
        ) : (
          <div className={cn("w-full animate-pulse bg-muted", framed && "rounded-md")} style={imageStyle} />
        )}
        <div aria-hidden className={cn("flex flex-col gap-1.5", framed ? "px-0.5 pb-0.5 pt-2.5" : "p-2.5")}>
          {children}
        </div>
      </div>
      <figcaption className="text-caption text-ink-muted">{label}</figcaption>
    </figure>
  );
}

function Bar({ className, strong = false }: { className?: string; strong?: boolean }) {
  return <span className={cn("block rounded-full", strong ? "h-2 bg-emphasis" : "h-1.5 bg-muted", className)} />;
}
