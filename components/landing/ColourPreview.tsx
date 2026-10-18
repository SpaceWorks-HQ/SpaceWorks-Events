"use client";

import { useState } from "react";
import { ACCENT_PRESETS, accentStyle } from "@/lib/theme/accent";
import { cn } from "@/lib/cn";
import { ThemedImage } from "@/components/ui/themed-image";

const swatchSrc: Record<(typeof ACCENT_PRESETS)[number]["name"], string> = {
  Ember: "/landing/swatch-ember.svg",
  Iris: "/landing/swatch-iris.svg",
  Teal: "/landing/swatch-teal.svg",
  Ink: "/landing/swatch-ink.svg",
};

/** "Your event, your colours" (Figma 119:771): pick a preset and the preview page follows. */
export function ColourPreview() {
  const [accent, setAccent] = useState<(typeof ACCENT_PRESETS)[number]>(ACCENT_PRESETS[0]);

  return (
    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-14">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-overline text-ink-muted">The event leads</p>
          <h2 className="text-display-m text-ink">Your event, your colours</h2>
          <p className="text-body-l text-ink-secondary">
            Yuyu stays quiet so your community’s colour, cover and logo lead the page. Pick a colour and every title, date and button follows, with contrast checked for you.
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
                  "inline-flex h-11 items-center gap-2.5 rounded-full bg-canvas pl-2.5 pr-4 text-label text-ink transition-colors hover:bg-subtle",
                  selected ? "border-2 border-ink" : "border border-line-strong",
                )}
              >
                <ThemedImage src={swatchSrc[preset.name]} darkSrc={preset.name === "Ink" ? "/landing/swatch-ink-dark.svg" : swatchSrc[preset.name]} width={22} height={22} className="size-[22px]" />
                {preset.name}
              </button>
            );
          })}
        </div>
      </div>

      <div style={accentStyle(accent.hex)} className="yy-accent-scope mx-auto w-full max-w-[552px] lg:mx-0 lg:justify-self-end">
        <div aria-hidden className="overflow-hidden rounded-[24px] border border-line bg-canvas shadow-float">
          <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
            <span className="flex size-7 items-center justify-center rounded-[9px] bg-accent text-[12px] font-bold text-on-accent transition-colors duration-300">BM</span>
            <span className="min-w-0 flex-1 truncate text-label text-ink">Bengaluru Makers</span>
            <span className="inline-flex h-9 items-center rounded-full bg-accent px-3.5 text-label text-on-accent transition-colors duration-300">Register — free</span>
          </div>
          <div className="relative h-[120px] overflow-hidden bg-accent transition-colors duration-300">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG design asset */}
            <img src="/landing/preview-cover-dots.svg" alt="" width={533} height={115} className="absolute left-[9px] top-[9px] h-[115px] w-[533px] max-w-none" />
          </div>
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-accent-soft px-[11px] py-1 text-[13px] font-bold leading-[1.4] text-accent-text">Workshop</span>
              <span className="rounded-full bg-muted px-[11px] py-1 text-[13px] font-bold leading-[1.4] text-ink-secondary">Every Saturday</span>
            </div>
            <p className="font-display text-[30px] font-extrabold leading-tight tracking-[-0.03em] text-accent-text transition-colors duration-300 sm:text-[36px]">Soldering for Beginners</p>
            <div className="flex items-center gap-3.5">
              <span className="flex h-[60px] w-14 shrink-0 flex-col items-center overflow-hidden rounded-md border border-line bg-canvas">
                <span className="w-full bg-accent py-[3px] text-center text-[11px] font-bold uppercase leading-[1.3] tracking-[0.08em] text-on-accent transition-colors duration-300">Oct</span>
                <span className="font-display text-[22px] font-extrabold leading-[1.35] text-ink">17</span>
              </span>
              <span className="flex flex-col">
                <span className="text-label text-ink">Sat 17 Oct · 11:00 AM</span>
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
