import type { IdCardLayoutElement } from "@/lib/idCardPrint";

export type CanvasInteraction = {
  selected: IdCardLayoutElement | null;
  onSelect: (element: IdCardLayoutElement) => void;
  /** Called once when a drag or nudge starts, so it becomes one undo step. */
  onBeginChange: () => void;
  onMove: (element: IdCardLayoutElement, xMm: number, yMm: number) => void;
  showGrid: boolean;
};
