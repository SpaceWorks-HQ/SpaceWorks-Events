import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { parsePattern } from "./patterns";

/**
 * Default colour per pattern letter, in Space Works colours: Maker Teal lit
 * dots, ink dots that follow the text colour (cream in dark mode), faint
 * unlit dots, one Workshop Orange highlight, cream and citron.
 */
export const DOT_COLORS: Record<string, string> = {
  X: "#006E63",
  O: "currentColor",
  ".": "color-mix(in srgb, currentColor 14%, transparent)",
  D: "#FF7447",
  W: "#FFF4E8",
  m: "#DFFF8F",
};

export type DotGridProps = {
  /** Rows separated by "|"; each character is a cell (space = no dot). */
  pattern: string;
  /** Dot diameter in px. */
  dot: number;
  /** Gap between dots in px. Defaults to a quarter of a dot. */
  gap?: number;
  /** Overrides for the letter → colour map. */
  colors?: Partial<Record<string, string>>;
  /** When set, the grid is an image with this accessible name (use for the logo). */
  label?: string;
  className?: string;
  cellClassName?: (cell: string, row: number, column: number) => string | undefined;
  cellStyle?: (cell: string, row: number, column: number) => CSSProperties | undefined;
  /** Extra inline style. Only for surfaces without the app stylesheet (global-error). */
  style?: CSSProperties;
};

/**
 * @deprecated Yuyu dot-sign renderer, kept so existing imports compile. Use
 * `SpaceWorksLogo` for the brand and lucide-react for icons.
 * Renders a dot pattern as a CSS grid of perfect circles.
 */
export function DotGrid({ pattern, dot, gap = dot / 4, colors, label, className, cellClassName, cellStyle, style }: DotGridProps) {
  const rows = parsePattern(pattern);
  const columns = rows[0]?.length ?? 0;
  const palette = { ...DOT_COLORS, ...colors };
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-dot-grid=""
      className={cn("inline-grid shrink-0", className)}
      // Display comes from the class (never inline) so `hidden md:inline-grid` style utilities work.
      style={{ gridTemplateColumns: `repeat(${columns}, ${dot}px)`, gridAutoRows: `${dot}px`, gap: `${gap}px`, ...style }}
    >
      {rows.flatMap((row, r) =>
        row.map((cell, c) => (
          <span
            key={`${r}-${c}`}
            className={cellClassName?.(cell, r, c)}
            style={{ borderRadius: "50%", backgroundColor: cell === " " ? "transparent" : palette[cell] ?? "transparent", ...cellStyle?.(cell, r, c) }}
          />
        )),
      )}
    </span>
  );
}
