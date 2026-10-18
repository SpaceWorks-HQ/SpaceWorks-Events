import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/* Small dot charts for the dashboard home. Decorative: every chart sits next
   to the number it illustrates, so they are hidden from assistive tech. */

const TONES = {
  ink: "bg-primary",
  marigold: "bg-brand-marigold",
  success: "bg-success-solid",
  amber: "bg-warning-solid",
} as const;

export type DotTone = keyof typeof TONES;

/** One column of stacked dots per value (0..levels), oldest or soonest first. */
export function DotColumns({ levels, max = 4, tone, dot = 6, className }: { levels: number[]; max?: number; tone: DotTone; dot?: number; className?: string }) {
  const gap = Math.max(2, Math.round(dot / 2));
  return (
    <span aria-hidden className={cn("flex items-end", className)} style={{ gap }}>
      {levels.map((level, column) => (
        <span key={column} className="flex flex-col-reverse" style={{ gap }}>
          {Array.from({ length: max }, (_, row) => (
            <span key={row} className={cn("rounded-full", row < level ? TONES[tone] : "bg-track")} style={{ width: dot, height: dot }} />
          ))}
        </span>
      ))}
    </span>
  );
}

/** A row of dots, the first `filled` of `total` lit. `color` is a validated hex (an event accent). */
export function DotMeter({ filled, total, color, dot = 7, className, style }: { filled: number; total: number; color: string; dot?: number; className?: string; style?: CSSProperties }) {
  const lit = Math.max(0, Math.min(total, filled));
  return (
    <span aria-hidden className={cn("flex flex-wrap", className)} style={{ gap: Math.max(3, Math.round(dot / 2)), ...style }}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={cn("shrink-0 rounded-full", index >= lit && "bg-track")} style={{ width: dot, height: dot, backgroundColor: index < lit ? color : undefined }} />
      ))}
    </span>
  );
}

/** Scales a count to `dots` for a meter so large capacities still read at a glance. */
export function meterDots(value: number, capacity: number, dots: number) {
  if (capacity <= 0) return 0;
  const scaled = Math.round((Math.min(value, capacity) / capacity) * dots);
  return value > 0 ? Math.max(1, scaled) : 0;
}
