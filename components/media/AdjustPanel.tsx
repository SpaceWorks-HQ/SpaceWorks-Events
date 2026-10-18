"use client";

import { useId } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { EditorSlider } from "./EditorSlider";
import { ADJUSTMENT_RANGES, LOOKS, cssFilter, isDefaultAdjustments, type Adjustments } from "./photoMath";

function signed(value: number) {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
}

/** One-tap looks plus brightness, contrast, and saturation. */
export function AdjustPanel({
  adjustments,
  thumbnailUrl,
  onChange,
}: {
  adjustments: Adjustments;
  /** A small, unfiltered rendering of the photo; each look applies its own CSS filter. */
  thumbnailUrl: string;
  onChange: (next: Adjustments) => void;
}) {
  const looksLabelId = useId();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span id={looksLabelId} className="text-label text-ink">
          Looks
        </span>
        <div role="group" aria-labelledby={looksLabelId} className="grid grid-cols-3 gap-2">
          {LOOKS.map((look) => {
            const selected = adjustments.look === look.id;
            return (
              <button
                key={look.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ ...adjustments, look: look.id })}
                className={cn(
                  "group flex min-w-0 flex-col items-center gap-1 rounded-lg p-1 text-caption font-semibold transition-colors duration-[180ms] ease-yy",
                  selected ? "bg-subtle text-ink" : "text-ink-muted hover:bg-subtle hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "block aspect-[3/2] w-full overflow-hidden rounded-md bg-muted ring-offset-2 ring-offset-canvas",
                    selected ? "ring-2 ring-primary" : "ring-1 ring-line",
                  )}
                >
                  {thumbnailUrl ? (
                    // Data URL thumbnail rendered from the photo being edited.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnailUrl} alt="" className="size-full object-cover" style={{ filter: cssFilter(look.ops) === "none" ? undefined : cssFilter(look.ops) }} />
                  ) : null}
                </span>
                {look.label}
              </button>
            );
          })}
        </div>
      </div>

      <EditorSlider
        label="Brightness"
        centred
        value={adjustments.brightness}
        {...ADJUSTMENT_RANGES.brightness}
        valueText={signed(adjustments.brightness)}
        onValueChange={(value) => onChange({ ...adjustments, brightness: value })}
      />
      <EditorSlider
        label="Contrast"
        centred
        value={adjustments.contrast}
        {...ADJUSTMENT_RANGES.contrast}
        valueText={signed(adjustments.contrast)}
        onValueChange={(value) => onChange({ ...adjustments, contrast: value })}
      />
      <EditorSlider
        label="Saturation"
        centred
        value={adjustments.saturation}
        {...ADJUSTMENT_RANGES.saturation}
        valueText={signed(adjustments.saturation)}
        onValueChange={(value) => onChange({ ...adjustments, saturation: value })}
      />

      <div>
        <Button
          variant="secondary"
          size="sm"
          startIcon={<RotateCcw />}
          disabled={isDefaultAdjustments(adjustments)}
          onClick={() => onChange({ brightness: 0, contrast: 0, saturation: 0, look: "original" })}
        >
          Reset adjustments
        </Button>
      </div>
    </div>
  );
}
