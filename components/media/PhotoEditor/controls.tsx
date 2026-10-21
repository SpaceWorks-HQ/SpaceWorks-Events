"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { EditorSlider } from "../EditorSlider";
import { DEFAULT_SHAPE, MAX_ZOOM, MIN_ZOOM, SHAPES, SHAPE_ORDER, shapeAspect, type ShapeId } from "../photoMath";

export const darkIconButton =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-secondary transition-colors duration-[180ms] ease-yy hover:bg-muted hover:text-ink disabled:pointer-events-none disabled:text-ink-disabled [&_svg]:size-[18px]";

export function ZoomSlider({ value, valueText, onChange }: { value: number; valueText: string; onChange: (value: number) => void }) {
  return (
    <div className="min-w-0 flex-1">
      <EditorSlider label="Zoom" hideLabel tone="dark" value={value} min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} valueText={valueText} onValueChange={onChange} />
    </div>
  );
}

export function ToolButton({ label, icon, onClick, pressed }: { label: string; icon: ReactNode; onClick: () => void; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-caption font-semibold transition-colors duration-[180ms] ease-yy [&_svg]:size-[18px]",
        pressed ? "border-primary bg-subtle text-ink" : "border-line text-ink-secondary hover:bg-subtle hover:text-ink",
      )}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

export function ShapePicker({ value, onChange }: { value: ShapeId; onChange: (value: ShapeId) => void }) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-label text-ink">
        Shape
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-3 gap-2">
        {SHAPE_ORDER.map((id) => {
          const shape = SHAPES[id];
          const selected = value === id;
          const aspect = shapeAspect(shape);
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(id)}
              onKeyDown={(event) => {
                const index = SHAPE_ORDER.indexOf(id);
                let next: number | null = null;
                if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % SHAPE_ORDER.length;
                if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + SHAPE_ORDER.length) % SHAPE_ORDER.length;
                if (next === null) return;
                event.preventDefault();
                const nextId = SHAPE_ORDER[next]!;
                onChange(nextId);
                (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
              }}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1.5 rounded-lg border px-1.5 pb-2 pt-2.5 text-center transition-colors duration-[180ms] ease-yy",
                selected ? "border-primary bg-subtle text-ink shadow-[inset_0_0_0_1px_var(--color-primary)]" : "border-line text-ink-secondary hover:bg-subtle hover:text-ink",
              )}
            >
              <span aria-hidden className="flex h-7 items-center">
                <span
                  className={cn("block rounded-[3px] border-[1.5px]", selected ? "border-ink bg-emphasis" : "border-ink-muted")}
                  style={aspect >= 1 ? { width: 32, height: 32 / aspect } : { width: 28 * aspect, height: 28 }}
                />
              </span>
              <span className="text-caption font-semibold leading-tight">{shape.label}</span>
              <span className="tabular-nums text-[11px] leading-none text-ink-muted">
                {shape.ratioLabel}
                {id === DEFAULT_SHAPE ? " · best" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
