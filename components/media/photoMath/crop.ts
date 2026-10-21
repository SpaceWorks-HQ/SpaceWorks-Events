/* Crop state and the geometry that keeps the image covering the frame. */

export type Vec = { x: number; y: number };

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
