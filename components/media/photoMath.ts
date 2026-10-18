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

export type Vec = { x: number; y: number };

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

/* ---------- Crop state ---------- */

export type QuarterTurns = 0 | 1 | 2 | 3;

export type CropState = {
  zoom: number;
  /** Offset of the image centre from the frame centre, in output pixels. */
  offset: Vec;
  quarterTurns: QuarterTurns;
  /** Fine rotation in degrees, −15…15. */
  straighten: number;
  flipX: boolean;
};

export type Dims = {
  imageWidth: number;
  imageHeight: number;
  frameWidth: number;
  frameHeight: number;
};

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const MAX_STRAIGHTEN = 15;

export const DEFAULT_CROP: CropState = { zoom: 1, offset: { x: 0, y: 0 }, quarterTurns: 0, straighten: 0, flipX: false };

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function rotationDegrees(state: Pick<CropState, "quarterTurns" | "straighten">) {
  return state.quarterTurns * 90 + state.straighten;
}

export function rotationRadians(state: Pick<CropState, "quarterTurns" | "straighten">) {
  return (rotationDegrees(state) * Math.PI) / 180;
}

/** Rotate a vector the same way canvas `rotate(radians)` does (clockwise on screen). */
export function rotateVec(v: Vec, radians: number): Vec {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

/** Half extents of the frame measured along the rotated image's axes. */
function frameExtentsInImageAxes(dims: Dims, radians: number) {
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const halfW = dims.frameWidth / 2;
  const halfH = dims.frameHeight / 2;
  return { x: halfW * cos + halfH * sin, y: halfW * sin + halfH * cos };
}

/** Smallest image scale at which the rotated image fully covers the frame (centred). */
export function coverScale(dims: Dims, radians: number) {
  const extents = frameExtentsInImageAxes(dims, radians);
  return Math.max((extents.x * 2) / dims.imageWidth, (extents.y * 2) / dims.imageHeight);
}

/** Output pixels per source pixel for a crop state. */
export function drawScale(state: CropState, dims: Dims) {
  return coverScale(dims, rotationRadians(state)) * state.zoom;
}

/** Keep the offset where the image still covers every corner of the frame. */
export function clampOffset(offset: Vec, dims: Dims, radians: number, scale: number): Vec {
  const extents = frameExtentsInImageAxes(dims, radians);
  const limitX = Math.max(0, (dims.imageWidth * scale) / 2 - extents.x);
  const limitY = Math.max(0, (dims.imageHeight * scale) / 2 - extents.y);
  // Work in the image's own axes, where the allowed region is an axis-aligned box.
  const local = rotateVec(offset, -radians);
  const clamped = { x: clamp(local.x, -limitX, limitX), y: clamp(local.y, -limitY, limitY) };
  const back = rotateVec(clamped, radians);
  return { x: back.x, y: back.y };
}

/** Clamp every field so the state is valid and the image covers the frame. */
export function normaliseCrop(state: CropState, dims: Dims): CropState {
  const zoom = clamp(Number.isFinite(state.zoom) ? state.zoom : 1, MIN_ZOOM, MAX_ZOOM);
  const straighten = clamp(Number.isFinite(state.straighten) ? state.straighten : 0, -MAX_STRAIGHTEN, MAX_STRAIGHTEN);
  const quarterTurns = ((((Math.round(state.quarterTurns) % 4) + 4) % 4) as QuarterTurns);
  const next = { ...state, zoom, straighten, quarterTurns };
  const radians = rotationRadians(next);
  const offset = clampOffset(
    { x: Number.isFinite(state.offset.x) ? state.offset.x : 0, y: Number.isFinite(state.offset.y) ? state.offset.y : 0 },
    dims,
    radians,
    coverScale(dims, radians) * zoom,
  );
  return { ...next, offset };
}

export function panBy(state: CropState, delta: Vec, dims: Dims): CropState {
  return normaliseCrop({ ...state, offset: { x: state.offset.x + delta.x, y: state.offset.y + delta.y } }, dims);
}

/**
 * Zoom while keeping the image point under `anchor` (frame coordinates from
 * the frame centre, output pixels) fixed on screen.
 */
export function zoomAround(state: CropState, nextZoom: number, anchor: Vec, dims: Dims): CropState {
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const ratio = zoom / state.zoom;
  const offset = {
    x: anchor.x - (anchor.x - state.offset.x) * ratio,
    y: anchor.y - (anchor.y - state.offset.y) * ratio,
  };
  return normaliseCrop({ ...state, zoom, offset }, dims);
}

export function setZoom(state: CropState, zoom: number, dims: Dims) {
  return zoomAround(state, zoom, { x: 0, y: 0 }, dims);
}

/** Rotate by a quarter turn; the visible area turns with the image. */
export function rotateQuarter(state: CropState, direction: 1 | -1, dims: Dims): CropState {
  const offset = rotateVec(state.offset, (direction * Math.PI) / 2);
  return normaliseCrop({ ...state, quarterTurns: (state.quarterTurns + direction + 4) % 4 as QuarterTurns, offset }, dims);
}

export function setStraighten(state: CropState, degrees: number, dims: Dims): CropState {
  return normaliseCrop({ ...state, straighten: degrees }, dims);
}

/**
 * Mirror the result horizontally across the frame's vertical centre line.
 * Flipping in image space and negating rotation and the x offset is the same
 * transform, which keeps drag and rotate directions intuitive afterwards.
 */
export function mirrorCrop(state: CropState, dims: Dims): CropState {
  return normaliseCrop(
    {
      ...state,
      flipX: !state.flipX,
      quarterTurns: ((4 - state.quarterTurns) % 4) as QuarterTurns,
      straighten: state.straighten === 0 ? 0 : -state.straighten,
      offset: { x: state.offset.x === 0 ? 0 : -state.offset.x, y: state.offset.y },
    },
    dims,
  );
}

/** Carry a crop over to a differently sized frame (shape change). */
export function changeFrame(state: CropState, from: Dims, to: Dims): CropState {
  const factor = to.frameWidth / from.frameWidth;
  return normaliseCrop({ ...state, offset: { x: state.offset.x * factor, y: state.offset.y * factor } }, to);
}

/** Map a frame point back into source image pixels (from the image centre). */
export function frameToImage(point: Vec, state: CropState, dims: Dims): Vec {
  const scale = drawScale(state, dims);
  const local = rotateVec({ x: point.x - state.offset.x, y: point.y - state.offset.y }, -rotationRadians(state));
  return { x: (state.flipX ? -local.x : local.x) / scale, y: local.y / scale };
}

/** True when every frame corner lands inside the image (with a small tolerance). */
export function coversFrame(state: CropState, dims: Dims, tolerance = 1e-6) {
  const halfW = dims.frameWidth / 2;
  const halfH = dims.frameHeight / 2;
  const corners: Vec[] = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ];
  return corners.every((corner) => {
    const point = frameToImage(corner, state, dims);
    return Math.abs(point.x) <= dims.imageWidth / 2 + tolerance && Math.abs(point.y) <= dims.imageHeight / 2 + tolerance;
  });
}

export function isDefaultCrop(state: CropState) {
  return (
    Math.abs(state.zoom - 1) < 1e-6 &&
    Math.abs(state.offset.x) < 1e-6 &&
    Math.abs(state.offset.y) < 1e-6 &&
    state.quarterTurns === 0 &&
    state.straighten === 0 &&
    !state.flipX
  );
}

/* ---------- Adjustments and looks ---------- */

export type FilterFn = "brightness" | "contrast" | "saturate" | "sepia" | "grayscale" | "hue-rotate";
export type FilterOp = { fn: FilterFn; amount: number };

export type LookId = "original" | "vivid" | "warm" | "cool" | "mono" | "soft";

export type Look = { id: LookId; label: string; ops: FilterOp[] };

export const LOOKS: Look[] = [
  { id: "original", label: "Original", ops: [] },
  { id: "vivid", label: "Vivid", ops: [{ fn: "contrast", amount: 1.12 }, { fn: "saturate", amount: 1.35 }] },
  { id: "warm", label: "Warm", ops: [{ fn: "sepia", amount: 0.22 }, { fn: "saturate", amount: 1.15 }, { fn: "brightness", amount: 1.03 }] },
  { id: "cool", label: "Cool", ops: [{ fn: "hue-rotate", amount: 12 }, { fn: "saturate", amount: 0.9 }, { fn: "brightness", amount: 1.04 }] },
  { id: "mono", label: "Mono", ops: [{ fn: "grayscale", amount: 1 }, { fn: "contrast", amount: 1.1 }] },
  { id: "soft", label: "Soft", ops: [{ fn: "contrast", amount: 0.86 }, { fn: "brightness", amount: 1.06 }, { fn: "saturate", amount: 0.88 }] },
];

export type Adjustments = {
  /** Percent change, −50…50. */
  brightness: number;
  /** Percent change, −50…50. */
  contrast: number;
  /** Percent change, −100…100. */
  saturation: number;
  look: LookId;
};

export const DEFAULT_ADJUSTMENTS: Adjustments = { brightness: 0, contrast: 0, saturation: 0, look: "original" };

export const ADJUSTMENT_RANGES = {
  brightness: { min: -50, max: 50 },
  contrast: { min: -50, max: 50 },
  saturation: { min: -100, max: 100 },
} as const;

export function isDefaultAdjustments(adjustments: Adjustments) {
  return adjustments.brightness === 0 && adjustments.contrast === 0 && adjustments.saturation === 0 && adjustments.look === "original";
}

/** The look first, then the organiser's slider changes on top. Identity ops are dropped. */
export function filterOps(adjustments: Adjustments): FilterOp[] {
  const look = LOOKS.find((item) => item.id === adjustments.look) ?? LOOKS[0]!;
  const ops: FilterOp[] = [...look.ops];
  const brightness = clamp(adjustments.brightness, ADJUSTMENT_RANGES.brightness.min, ADJUSTMENT_RANGES.brightness.max);
  const contrast = clamp(adjustments.contrast, ADJUSTMENT_RANGES.contrast.min, ADJUSTMENT_RANGES.contrast.max);
  const saturation = clamp(adjustments.saturation, ADJUSTMENT_RANGES.saturation.min, ADJUSTMENT_RANGES.saturation.max);
  if (brightness !== 0) ops.push({ fn: "brightness", amount: 1 + brightness / 100 });
  if (contrast !== 0) ops.push({ fn: "contrast", amount: 1 + contrast / 100 });
  if (saturation !== 0) ops.push({ fn: "saturate", amount: 1 + saturation / 100 });
  return ops;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** CSS / canvas `filter` string for a list of ops. */
export function cssFilter(ops: FilterOp[]) {
  if (ops.length === 0) return "none";
  return ops.map((op) => (op.fn === "hue-rotate" ? `hue-rotate(${round(op.amount)}deg)` : `${op.fn}(${round(op.amount)})`)).join(" ");
}

/**
 * 3×4 row-major colour matrix (r, g, b, offset per output channel, channels
 * 0..1) for one op, following the Filter Effects spec definitions.
 */
export function opMatrix(op: FilterOp): number[] {
  const a = op.amount;
  switch (op.fn) {
    case "brightness":
      return [a, 0, 0, 0, 0, a, 0, 0, 0, 0, a, 0];
    case "contrast": {
      const intercept = 0.5 - 0.5 * a;
      return [a, 0, 0, intercept, 0, a, 0, intercept, 0, 0, a, intercept];
    }
    case "saturate":
      return [
        0.213 + 0.787 * a, 0.715 - 0.715 * a, 0.072 - 0.072 * a, 0,
        0.213 - 0.213 * a, 0.715 + 0.285 * a, 0.072 - 0.072 * a, 0,
        0.213 - 0.213 * a, 0.715 - 0.715 * a, 0.072 + 0.928 * a, 0,
      ];
    case "grayscale": {
      const g = 1 - clamp(a, 0, 1);
      return [
        0.2126 + 0.7874 * g, 0.7152 - 0.7152 * g, 0.0722 - 0.0722 * g, 0,
        0.2126 - 0.2126 * g, 0.7152 + 0.2848 * g, 0.0722 - 0.0722 * g, 0,
        0.2126 - 0.2126 * g, 0.7152 - 0.7152 * g, 0.0722 + 0.9278 * g, 0,
      ];
    }
    case "sepia": {
      const g = 1 - clamp(a, 0, 1);
      return [
        0.393 + 0.607 * g, 0.769 - 0.769 * g, 0.189 - 0.189 * g, 0,
        0.349 - 0.349 * g, 0.686 + 0.314 * g, 0.168 - 0.168 * g, 0,
        0.272 - 0.272 * g, 0.534 - 0.534 * g, 0.131 + 0.869 * g, 0,
      ];
    }
    case "hue-rotate": {
      const rad = (a * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      return [
        0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928, 0,
        0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283, 0,
        0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072, 0,
      ];
    }
  }
}

/**
 * Apply filter ops to RGBA pixels in place, clamping after each op like the
 * browser does. Used when the browser's canvas has no `filter` support.
 */
export function applyFilterOps(data: Uint8ClampedArray, ops: FilterOp[]) {
  if (ops.length === 0) return data;
  const matrices = ops.map(opMatrix);
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]! / 255;
    let g = data[i + 1]! / 255;
    let b = data[i + 2]! / 255;
    for (const m of matrices) {
      const nr = m[0]! * r + m[1]! * g + m[2]! * b + m[3]!;
      const ng = m[4]! * r + m[5]! * g + m[6]! * b + m[7]!;
      const nb = m[8]! * r + m[9]! * g + m[10]! * b + m[11]!;
      r = clamp(nr, 0, 1);
      g = clamp(ng, 0, 1);
      b = clamp(nb, 0, 1);
    }
    data[i] = r * 255;
    data[i + 1] = g * 255;
    data[i + 2] = b * 255;
  }
  return data;
}

/* ---------- Input and output ---------- */

export const MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const OUTPUT_QUALITY = 0.9;

/** A friendly reason a file can't be used, or null when it is fine. */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "That file isn't a JPEG, PNG or WebP image. Choose one of those formats.";
  }
  if (file.size === 0) return "That image file is empty. Choose another one.";
  if (file.size > MAX_INPUT_BYTES) {
    return `That image is ${formatBytes(file.size)}. Choose one that is 5 MB or smaller.`;
  }
  return null;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function mimeLabel(mime: string) {
  if (mime === "image/webp") return "WebP";
  if (mime === "image/jpeg") return "JPEG";
  if (mime === "image/png") return "PNG";
  return mime;
}

export function outputFileName(baseName: string, mime: string) {
  const extension = mime === "image/webp" ? "webp" : mime === "image/png" ? "png" : "jpg";
  const safe = baseName.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "photo";
  return `${safe}.${extension}`;
}
