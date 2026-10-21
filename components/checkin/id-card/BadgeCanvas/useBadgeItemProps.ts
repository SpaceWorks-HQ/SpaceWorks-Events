"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import type { IdCardLayoutElement, IdCardPrintSettings } from "@/lib/idCardPrint";
import { ELEMENT_LABELS } from "@/components/checkin/id-card/shared";
import type { CanvasInteraction } from "@/components/checkin/id-card/BadgeCanvas/types";

/** Selection, drag and arrow-key nudging for one badge item; empty props without `interaction`. */
export function useBadgeItemProps(settings: IdCardPrintSettings, pxPerMm: number, interaction?: CanvasInteraction) {
  const [drag, setDrag] = useState<{ element: IdCardLayoutElement; startX: number; startY: number; origin: { xMm: number; yMm: number } } | null>(null);

  const itemProps = (element: IdCardLayoutElement) => {
    if (!interaction) return {};
    const selected = interaction.selected === element;
    return {
      role: "button" as const,
      tabIndex: 0,
      "aria-label": `${ELEMENT_LABELS[element]}. Arrow keys move it; hold Shift for bigger steps.`,
      "aria-pressed": selected,
      "data-selected": selected ? "" : undefined,
      className: "outline-offset-2 hover:outline hover:outline-1 hover:outline-primary focus-visible:outline-2 data-[selected]:outline data-[selected]:outline-2 data-[selected]:outline-primary",
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        interaction.onSelect(element);
        interaction.onBeginChange();
        setDrag({ element, startX: event.clientX, startY: event.clientY, origin: settings.elementPositions[element] });
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (!drag || drag.element !== element) return;
        interaction.onMove(element, drag.origin.xMm + (event.clientX - drag.startX) / pxPerMm, drag.origin.yMm + (event.clientY - drag.startY) / pxPerMm);
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        setDrag(null);
      },
      onPointerCancel: () => setDrag(null),
      onFocus: () => interaction.onSelect(element),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        const step = event.shiftKey ? settings.gridSizeMm * 5 : settings.gridSizeMm;
        const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        const move = moves[event.key];
        if (!move) return;
        event.preventDefault();
        interaction.onBeginChange();
        const at = settings.elementPositions[element];
        interaction.onMove(element, at.xMm + move[0], at.yMm + move[1]);
      },
    };
  };

  return itemProps;
}
