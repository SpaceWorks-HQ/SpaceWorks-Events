"use client";

import { ACCENT_PRESETS, DEFAULT_EVENT_ACCENT } from "@/lib/theme/accent";
import { ColorPicker } from "@/components/ui/color-picker";
import { cn } from "@/lib/cn";
import { type parseAccentInput } from "@/components/event-dashboard/event-page/summary";

export function ColourSection({
  accent,
  accentPreview,
  customAccent,
  setAccentColor,
  touch,
}: {
  accent: ReturnType<typeof parseAccentInput>;
  accentPreview: string;
  customAccent: boolean;
  setAccentColor: (value: string) => void;
  touch: () => void;
}) {
  return (
    <section aria-labelledby="event-page-colour-title" className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-5">
      <div>
        <h2 id="event-page-colour-title" className="text-h4 text-ink">Colour</h2>
        <p className="mt-0.5 text-body-ui text-ink-muted">The accent for the hero band, buttons and links on the event page.</p>
      </div>
      <div role="group" aria-label="Accent presets" className="flex flex-wrap items-center gap-2">
        {ACCENT_PRESETS.map((preset) => {
          const selected = accent.valid && accentPreview === preset.hex;
          return (
            <button
              key={preset.hex}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setAccentColor(preset.hex);
                touch();
              }}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-full bg-panel pl-2 pr-3.5 text-sm font-semibold text-ink transition-colors hover:bg-subtle",
                selected ? "border-2 border-ink" : "border border-line-strong",
              )}
            >
              <span aria-hidden className="size-6 rounded-full" style={{ backgroundColor: preset.hex }} />
              {preset.name}
            </button>
          );
        })}
        <ColorPicker
          value={accent.valid ? accent.value : ""}
          defaultColor={DEFAULT_EVENT_ACCENT}
          onChange={(hex) => {
            setAccentColor(hex);
            touch();
          }}
          trigger={
            <button
              type="button"
              aria-label={customAccent ? `Custom colour ${accentPreview}, change` : "Choose a custom colour"}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-full bg-panel pl-2 pr-3.5 text-sm font-semibold text-ink transition-colors hover:bg-subtle",
                customAccent ? "border-2 border-ink" : "border border-line-strong",
              )}
            >
              <span
                aria-hidden
                className="size-6 rounded-full"
                style={{ background: customAccent ? accentPreview : "conic-gradient(#f43f5e, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #f43f5e)" }}
              />
              {customAccent ? <span className="tabular-nums">{accentPreview}</span> : "Custom"}
            </button>
          }
        />
      </div>
      {accent.valid ? null : <p className="text-caption text-danger-fg">The saved colour isn&apos;t a valid hex colour. Pick a preset or a custom colour.</p>}
    </section>
  );
}
