"use client";

import { useState } from "react";
import { ACCENT_PRESETS, accentStyle } from "@/lib/theme/accent";
import { cn } from "@/lib/cn";

type Preset = (typeof ACCENT_PRESETS)[number];

/** "Your event, your colours": pick a preset and the preview page follows. */
export function ColourPreview() {
  const [accent, setAccent] = useState<Preset>(ACCENT_PRESETS[0]);

  return (
    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-14">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-overline text-ink-muted">The event leads</p>
          <h2 className="text-display-m text-ink">Your event, your colours</h2>
          <p className="text-body-l text-ink-secondary">
            Space Works Events stays quiet so your community’s colour, cover and logo lead the page. Pick a colour and every title, date and button follows, with contrast checked for you.
          </p>
        </div>
        <div role="group" aria-label="Preview colour" className="flex flex-wrap gap-2.5">
          {ACCENT_PRESETS.map((preset) => {
            const selected = preset.name === accent.name;
            return (
              <button
                key={preset.name}
                type="button"
                aria-pressed={selected}
                onClick={() => setAccent(preset)}
                className={cn(
                  "inline-flex h-11 items-center gap-2.5 rounded-full bg-panel pl-2.5 pr-4 text-label text-ink transition-colors hover:bg-surface",
                  selected ? "border-2 border-ink" : "border border-line-strong",
                )}
              >
                <span aria-hidden className="size-[22px] rounded-full border border-line" style={{ background: preset.hex }} />
                {preset.name}
              </button>
            );
          })}
        </div>
      </div>

      <div style={accentStyle(accent.hex)} className="yy-accent-scope mx-auto w-full max-w-[552px] lg:mx-0 lg:justify-self-end">
        <div aria-hidden className="overflow-hidden rounded-[16px] border border-line bg-panel">
          <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
            <span className="flex size-7 items-center justify-center rounded-[9px] bg-accent text-[12px] font-semibold text-on-accent transition-colors duration-300">KM</span>
            <span className="min-w-0 flex-1 truncate text-label text-ink">Kochi Makers</span>
            <span className="inline-flex h-9 items-center rounded-full bg-accent px-3.5 text-label text-on-accent transition-colors duration-300">Register — free</span>
          </div>
          <div className="relative h-[120px] overflow-hidden bg-accent transition-colors duration-300">
            <span className="absolute -left-6 top-5 size-28 rounded-full bg-accent-soft" />
            <span className="absolute left-[132px] top-8 size-16 rounded-[14px] bg-on-accent" />
            <span className="absolute -bottom-8 right-10 size-28 rounded-tl-full bg-accent-soft" />
          </div>
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-accent-soft px-[11px] py-1 text-[13px] font-semibold leading-[1.4] text-accent-text">Workshop</span>
              <span className="rounded-full border border-line bg-surface px-[11px] py-1 text-[13px] font-semibold leading-[1.4] text-ink">Every Saturday</span>
            </div>
            <p className="text-[30px] font-semibold leading-tight text-accent-text transition-colors duration-300 sm:text-[36px]">Soldering for Beginners</p>
            <div className="flex items-center gap-3.5">
              <span className="flex h-[60px] w-14 shrink-0 flex-col items-center overflow-hidden rounded-[10px] border border-line bg-panel">
                <span className="w-full bg-accent py-[3px] text-center text-[11px] font-semibold uppercase leading-[1.3] tracking-[0.08em] text-on-accent transition-colors duration-300">Nov</span>
                <span className="text-[22px] font-semibold leading-[1.35] tabular-nums text-ink">21</span>
              </span>
              <span className="flex flex-col">
                <span className="text-label text-ink">Sat 21 Nov · 11:00 AM</span>
                <span className="text-body-ui text-ink-muted">[Your venue]</span>
              </span>
            </div>
            <div className="flex gap-1 border-b border-line">
              <span className="border-b-2 border-ink px-3 py-2.5 text-[15px] font-semibold text-ink">About</span>
              <span className="px-3 py-2.5 text-[15px] text-ink-muted">Schedule</span>
              <span className="px-3 py-2.5 text-[15px] text-ink-muted">Venue</span>
              <span className="px-3 py-2.5 text-[15px] text-ink-muted">FAQ</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
