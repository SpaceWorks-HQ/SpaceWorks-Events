"use client";

import type { KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, Copy, Image as ImageIcon, Trash2, Type } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { CertificateElement } from "@/lib/certificateTemplate";
import { layerName, MAX_LAYERS } from "./layers";

/** Layers listed top-most first, like most design tools. */
export function LayersPanel({
  elements, selectedId, disabled, onSelect, onMove, onDuplicate, onDelete, onKeyDown,
}: {
  elements: CertificateElement[];
  selectedId: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  /** +1 brings a layer forward (later in paint order), -1 sends it back. */
  onMove: (id: string, direction: 1 | -1) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onKeyDown: (event: KeyboardEvent<Element>) => void;
}) {
  const ordered = elements.map((element, index) => ({ element, index })).reverse();
  return (
    <section aria-labelledby="certificate-layers-title" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 id="certificate-layers-title" className="text-label text-ink">Layers</h4>
        <span className="text-caption text-ink-muted">{elements.length} of {MAX_LAYERS}</span>
      </div>
      {elements.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-caption text-ink-muted">No layers yet. Add text or an image.</p>
      ) : (
        <ul className="flex flex-col gap-1" onKeyDown={onKeyDown}>
          {ordered.map(({ element, index }) => {
            const selected = element.id === selectedId;
            const name = layerName(element);
            const Icon = element.type === "text" ? Type : ImageIcon;
            return (
              <li
                key={element.id}
                className={cn(
                  "flex items-center gap-1 rounded-lg border pr-1 transition-colors",
                  selected ? "border-accent bg-canvas" : "border-transparent hover:bg-canvas",
                )}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-current={selected ? "true" : undefined}
                  aria-label={`${element.type === "text" ? "Text" : "Image"} layer: ${name}`}
                  onClick={() => onSelect(element.id)}
                  className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-left text-body-ui text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Icon aria-hidden className={cn("size-4 shrink-0", selected ? "text-accent" : "text-ink-muted")} />
                  <span className="min-w-0 truncate">{name}</span>
                </button>
                <IconButton label={`Bring ${name} forward`} size="sm" className="size-8" disabled={disabled || index === elements.length - 1} onClick={() => onMove(element.id, 1)}><ArrowUp /></IconButton>
                <IconButton label={`Send ${name} backward`} size="sm" className="size-8" disabled={disabled || index === 0} onClick={() => onMove(element.id, -1)}><ArrowDown /></IconButton>
                <IconButton label={`Duplicate ${name}`} size="sm" className="size-8" disabled={disabled || elements.length >= MAX_LAYERS} onClick={() => onDuplicate(element.id)}><Copy /></IconButton>
                <IconButton label={`Delete ${name}`} size="sm" variant="danger" className="size-8" disabled={disabled} onClick={() => onDelete(element.id)}><Trash2 /></IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
