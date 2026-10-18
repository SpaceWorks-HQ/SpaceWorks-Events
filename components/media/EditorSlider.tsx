"use client";

import { useId, type ReactNode } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/cn";

/** A labelled Radix slider with a visible value, used throughout the photo editor. */
export function EditorSlider({
  label,
  value,
  min,
  max,
  step = 1,
  valueText,
  onValueChange,
  onValueCommit,
  hideLabel = false,
  before,
  after,
  centred = false,
  tone = "default",
  className,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Human-readable value, shown and announced (e.g. "+12" or "150%"). */
  valueText: string;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
  hideLabel?: boolean;
  before?: ReactNode;
  after?: ReactNode;
  /** Fill the track from the centre (for −/+ adjustments). */
  centred?: boolean;
  /** "dark" for use on the always-dark crop backdrop. */
  tone?: "default" | "dark";
  className?: string;
}) {
  const labelId = useId();
  const dark = tone === "dark";
  const span = max - min;
  const zeroAt = ((0 - min) / span) * 100;
  const valueAt = ((value - min) / span) * 100;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className={cn("flex items-center justify-between gap-3", hideLabel && "sr-only")}>
        <span id={labelId} className={cn("text-label", dark ? "text-white" : "text-ink")}>
          {label}
        </span>
        <span aria-hidden className={cn("font-mono text-caption tabular-nums", dark ? "text-white/70" : "text-ink-muted")}>
          {valueText}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {before}
        <SliderPrimitive.Root
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={([next]) => onValueChange(next ?? value)}
          onValueCommit={onValueCommit ? ([next]) => onValueCommit(next ?? value) : undefined}
          className="relative flex h-9 min-w-0 flex-1 touch-none select-none items-center"
        >
          <SliderPrimitive.Track className={cn("relative h-1.5 grow overflow-hidden rounded-full", dark ? "bg-white/20" : "bg-track")}>
            {centred ? (
              <span
                aria-hidden
                className={cn("absolute h-full rounded-full", dark ? "bg-white" : "bg-primary")}
                style={{ left: `${Math.min(zeroAt, valueAt)}%`, width: `${Math.abs(valueAt - zeroAt)}%` }}
              />
            ) : (
              <SliderPrimitive.Range className={cn("absolute h-full rounded-full", dark ? "bg-white" : "bg-primary")} />
            )}
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-labelledby={labelId}
            aria-valuetext={valueText}
            className={cn(
              "block size-5 rounded-full border-2 shadow-raised transition-shadow duration-[180ms] ease-yy hover:shadow-float",
              dark ? "border-white bg-[#111113] focus-visible:outline-white" : "border-primary bg-canvas",
            )}
          />
        </SliderPrimitive.Root>
        {after}
      </div>
    </div>
  );
}
