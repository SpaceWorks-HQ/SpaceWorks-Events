/**
 * Pure geometry, filter, and output helpers for the photo editor.
 *
 * Nothing here touches the DOM, so it is shared by the editor UI, the canvas
 * renderer, and the unit tests (tests/unit/photo-math.test.ts).
 *
 * Coordinate model (matches CanvasRenderingContext2D, y points down):
 *   frame point = offset + R(rotation) · flip · (scale · image point)
 * where image points are measured from the image centre and the frame point
 * from the frame centre, both in output pixels. `scale` is the smallest scale
 * at which the rotated image covers the whole frame, multiplied by `zoom`
 * (zoom >= 1), so the image can never leave an empty edge.
 */

export * from "@/components/media/photoMath/crop";
export * from "@/components/media/photoMath/filters";
export * from "@/components/media/photoMath/output";

/* ---------- Output shapes ---------- */

export type ShapeId = "banner" | "wide" | "square";

export type ShapePreset = {
  id: ShapeId;
  label: string;
  ratioLabel: string;
  width: number;
  height: number;
};

export const SHAPES: Record<ShapeId, ShapePreset> = {
  banner: { id: "banner", label: "Event page banner", ratioLabel: "16:7", width: 1680, height: 735 },
  wide: { id: "wide", label: "Wide", ratioLabel: "16:9", width: 1600, height: 900 },
  square: { id: "square", label: "Square", ratioLabel: "1:1", width: 1200, height: 1200 },
};

export const SHAPE_ORDER: ShapeId[] = ["banner", "wide", "square"];
export const DEFAULT_SHAPE: ShapeId = "banner";

export function shapeAspect(shape: ShapePreset) {
  return shape.width / shape.height;
}

/* ---------- Where the same image is cropped elsewhere ---------- */

export type CropGuide = { id: string; label: string; aspect: number };

/**
 * Other places that centre-crop the cover with `object-cover`:
 * the event page header (16:7), dashboard/discover cards (~140–150px tall on
 * ~340–375px wide cards, about 2.5:1), and social link previews (og:image,
 * 1.91:1).
 */
export const CROP_GUIDES: CropGuide[] = [
  { id: "page", label: "Event page", aspect: 16 / 7 },
  { id: "cards", label: "Cards", aspect: 2.5 },
  { id: "social", label: "Social share", aspect: 1.91 },
];

/** Guides worth drawing for a frame: skip those that match the frame itself. */
export function guidesForAspect(frameAspect: number, guides: CropGuide[] = CROP_GUIDES) {
  return guides.filter((guide) => Math.abs(guide.aspect - frameAspect) / frameAspect > 0.02);
}

/**
 * The centred region (as fractions of the frame, 0..1) that an `object-cover`
 * box of `cropAspect` keeps from an image of `frameAspect`.
 */
export function centreCropRect(frameAspect: number, cropAspect: number) {
  if (cropAspect >= frameAspect) {
    const height = frameAspect / cropAspect;
    return { left: 0, top: (1 - height) / 2, width: 1, height };
  }
  const width = cropAspect / frameAspect;
  return { left: (1 - width) / 2, top: 0, width, height: 1 };
}

/** Largest box of `aspect` that fits inside `boxWidth` × `boxHeight` after padding. */
export function fitFrame(boxWidth: number, boxHeight: number, aspect: number, padding = 0) {
  const availableWidth = Math.max(0, boxWidth - padding * 2);
  const availableHeight = Math.max(0, boxHeight - padding * 2);
  if (availableWidth / Math.max(availableHeight, 1e-9) > aspect) {
    return { width: availableHeight * aspect, height: availableHeight };
  }
  return { width: availableWidth, height: availableWidth / aspect };
}
