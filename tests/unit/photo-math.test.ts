import { describe, expect, it } from "vitest";
import {
  CROP_GUIDES,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_CROP,
  MAX_ZOOM,
  SHAPES,
  applyFilterOps,
  centreCropRect,
  changeFrame,
  clampOffset,
  coverScale,
  coversFrame,
  cssFilter,
  drawScale,
  filterOps,
  fitFrame,
  formatBytes,
  frameToImage,
  guidesForAspect,
  isDefaultAdjustments,
  isDefaultCrop,
  mirrorCrop,
  normaliseCrop,
  opMatrix,
  outputFileName,
  panBy,
  rotateQuarter,
  rotateVec,
  setStraighten,
  setZoom,
  shapeAspect,
  validateImageFile,
  zoomAround,
  type CropState,
  type Dims,
} from "@/components/media/photoMath";

const banner: Dims = { imageWidth: 4000, imageHeight: 3000, frameWidth: 1680, frameHeight: 735 };
const portrait: Dims = { imageWidth: 1080, imageHeight: 1920, frameWidth: 1680, frameHeight: 735 };
const square: Dims = { imageWidth: 800, imageHeight: 600, frameWidth: 1200, frameHeight: 1200 };

/** Small deterministic PRNG so the property tests are repeatable. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe("shapes and guides", () => {
  it("defaults to the 16:7 event page banner at 1680×735", () => {
    expect(SHAPES.banner.width / SHAPES.banner.height).toBeCloseTo(16 / 7, 3);
    expect(SHAPES.wide).toMatchObject({ width: 1600, height: 900 });
    expect(SHAPES.square).toMatchObject({ width: 1200, height: 1200 });
  });

  it("hides the guide that matches the frame itself", () => {
    const ids = guidesForAspect(shapeAspect(SHAPES.banner)).map((guide) => guide.id);
    expect(ids).toEqual(["cards", "social"]);
    expect(guidesForAspect(1).map((guide) => guide.id)).toEqual(CROP_GUIDES.map((guide) => guide.id));
  });

  it("computes object-cover centre crops", () => {
    // A wider box trims top and bottom.
    const wider = centreCropRect(16 / 7, 2.5);
    expect(wider.left).toBe(0);
    expect(wider.width).toBe(1);
    expect(wider.height).toBeCloseTo((16 / 7) / 2.5, 6);
    expect(wider.top).toBeCloseTo((1 - wider.height) / 2, 6);
    // A narrower box trims the sides.
    const narrower = centreCropRect(16 / 7, 1.91);
    expect(narrower.top).toBe(0);
    expect(narrower.height).toBe(1);
    expect(narrower.width).toBeCloseTo(1.91 / (16 / 7), 6);
    expect(narrower.left + narrower.width / 2).toBeCloseTo(0.5, 6);
  });

  it("fits the frame inside the stage", () => {
    expect(fitFrame(1000, 1000, 2, 0)).toEqual({ width: 1000, height: 500 });
    expect(fitFrame(1000, 300, 2, 50)).toEqual({ width: 400, height: 200 });
  });
});

describe("cover geometry", () => {
  it("covers the frame exactly at zoom 1 with no rotation", () => {
    const scale = coverScale(banner, 0);
    expect(scale).toBeCloseTo(Math.max(1680 / 4000, 735 / 3000), 9);
    expect(coversFrame(DEFAULT_CROP, banner)).toBe(true);
  });

  it("swaps the limiting side after a quarter turn", () => {
    const scale = coverScale(portrait, Math.PI / 2);
    // Rotated, the 1080-wide side runs vertically and the 1920 side horizontally.
    expect(scale).toBeCloseTo(Math.max(1680 / 1920, 735 / 1080), 9);
  });

  it("grows the cover scale when straightening so no corner is empty", () => {
    const flat = coverScale(banner, 0);
    const tilted = coverScale(banner, (10 * Math.PI) / 180);
    expect(tilted).toBeGreaterThan(flat);
    const state = setStraighten(DEFAULT_CROP, 10, banner);
    expect(coversFrame(state, banner)).toBe(true);
  });

  it("clamps offsets to the image edge", () => {
    const state = panBy(DEFAULT_CROP, { x: 10_000, y: 0 }, banner);
    expect(coversFrame(state, banner)).toBe(true);
    // At zoom 1 the 4:3 image is limited by width, so it can only move vertically.
    expect(state.offset.x).toBeCloseTo(0, 6);
    const vertical = panBy(DEFAULT_CROP, { x: 0, y: 10_000 }, banner);
    const scale = drawScale(vertical, banner);
    expect(vertical.offset.y).toBeCloseTo((3000 * scale) / 2 - 735 / 2, 6);
    // Nudging further changes nothing.
    expect(panBy(vertical, { x: 0, y: 50 }, banner).offset.y).toBeCloseTo(vertical.offset.y, 6);
  });

  it("clamps in rotated image axes", () => {
    const radians = (12 * Math.PI) / 180;
    const scale = coverScale(banner, radians) * 1.5;
    const offset = clampOffset({ x: 5000, y: -5000 }, banner, radians, scale);
    const state: CropState = { ...DEFAULT_CROP, zoom: 1.5, straighten: 12, offset };
    expect(coversFrame(state, banner)).toBe(true);
    // Touches the boundary: a little further would uncover a corner.
    const pushed: CropState = { ...state, offset: { x: offset.x * 1.02, y: offset.y * 1.02 } };
    expect(coversFrame(pushed, banner)).toBe(false);
  });

  it("always covers the frame after random edits", () => {
    const random = rng(42);
    for (const dims of [banner, portrait, square]) {
      let state = DEFAULT_CROP;
      for (let i = 0; i < 400; i += 1) {
        const pick = random();
        if (pick < 0.3) state = panBy(state, { x: (random() - 0.5) * 3000, y: (random() - 0.5) * 3000 }, dims);
        else if (pick < 0.5) state = zoomAround(state, 1 + random() * 4, { x: (random() - 0.5) * dims.frameWidth, y: (random() - 0.5) * dims.frameHeight }, dims);
        else if (pick < 0.65) state = setStraighten(state, (random() - 0.5) * 40, dims);
        else if (pick < 0.8) state = rotateQuarter(state, random() < 0.5 ? 1 : -1, dims);
        else state = mirrorCrop(state, dims);
        expect(coversFrame(state, dims, 1e-6)).toBe(true);
        expect(state.zoom).toBeGreaterThanOrEqual(1);
        expect(state.zoom).toBeLessThanOrEqual(MAX_ZOOM);
        expect(Math.abs(state.straighten)).toBeLessThanOrEqual(15);
      }
    }
  });
});

describe("crop actions", () => {
  it("clamps zoom and straighten ranges", () => {
    expect(setZoom(DEFAULT_CROP, 99, banner).zoom).toBe(MAX_ZOOM);
    expect(setZoom(DEFAULT_CROP, 0.2, banner).zoom).toBe(1);
    expect(setStraighten(DEFAULT_CROP, 40, banner).straighten).toBe(15);
    expect(setStraighten(DEFAULT_CROP, -40, banner).straighten).toBe(-15);
  });

  it("keeps the anchor point fixed while zooming", () => {
    const anchor = { x: 300, y: -100 };
    const before = frameToImage(anchor, DEFAULT_CROP, banner);
    const zoomed = zoomAround(DEFAULT_CROP, 2, anchor, banner);
    const after = frameToImage(anchor, zoomed, banner);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("wraps quarter turns in both directions", () => {
    expect(rotateQuarter(DEFAULT_CROP, -1, banner).quarterTurns).toBe(3);
    let state = DEFAULT_CROP;
    for (let i = 0; i < 4; i += 1) state = rotateQuarter(state, 1, banner);
    expect(state.quarterTurns).toBe(0);
  });

  it("mirrors the visible result across the vertical centre line", () => {
    const start = normaliseCrop({ zoom: 2, offset: { x: 120, y: 40 }, quarterTurns: 1, straighten: 7, flipX: false }, banner);
    const mirrored = mirrorCrop(start, banner);
    expect(mirrored.flipX).toBe(true);
    for (const point of [{ x: 200, y: 50 }, { x: -600, y: 300 }, { x: 0, y: 0 }]) {
      const original = frameToImage(point, start, banner);
      const flipped = frameToImage({ x: -point.x, y: point.y }, mirrored, banner);
      expect(flipped.x).toBeCloseTo(original.x, 6);
      expect(flipped.y).toBeCloseTo(original.y, 6);
    }
    const back = mirrorCrop(mirrored, banner);
    expect(back.flipX).toBe(false);
    expect(back.offset.x).toBeCloseTo(start.offset.x, 6);
    expect(back.straighten).toBe(start.straighten);
    expect(back.quarterTurns).toBe(start.quarterTurns);
  });

  it("keeps coverage when changing shape", () => {
    const zoomed = zoomAround(DEFAULT_CROP, 3, { x: 0, y: 0 }, banner);
    const moved = panBy(zoomed, { x: 900, y: 600 }, banner);
    const squareDims = { ...banner, frameWidth: 1200, frameHeight: 1200 };
    const next = changeFrame(moved, banner, squareDims);
    expect(coversFrame(next, squareDims)).toBe(true);
  });

  it("recognises the untouched state", () => {
    expect(isDefaultCrop(DEFAULT_CROP)).toBe(true);
    expect(isDefaultCrop(setZoom(DEFAULT_CROP, 1.5, banner))).toBe(false);
  });

  it("rotates vectors like canvas rotate()", () => {
    const v = rotateVec({ x: 1, y: 0 }, Math.PI / 2);
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(1, 9);
  });
});

describe("adjustments", () => {
  it("produces no filter for the defaults", () => {
    expect(isDefaultAdjustments(DEFAULT_ADJUSTMENTS)).toBe(true);
    expect(filterOps(DEFAULT_ADJUSTMENTS)).toEqual([]);
    expect(cssFilter([])).toBe("none");
  });

  it("applies the look before the sliders", () => {
    const ops = filterOps({ brightness: 10, contrast: -20, saturation: 0, look: "mono" });
    expect(cssFilter(ops)).toBe("grayscale(1) contrast(1.1) brightness(1.1) contrast(0.8)");
  });

  it("clamps slider values", () => {
    expect(cssFilter(filterOps({ ...DEFAULT_ADJUSTMENTS, saturation: -400 }))).toBe("saturate(0)");
  });

  it("matches CSS filter maths in the pixel fallback", () => {
    const pixel = () => new Uint8ClampedArray([200, 100, 50, 255]);
    expect(Array.from(applyFilterOps(pixel(), [{ fn: "brightness", amount: 0.5 }]))).toEqual([100, 50, 25, 255]);
    expect(Array.from(applyFilterOps(pixel(), [{ fn: "contrast", amount: 0 }]))).toEqual([128, 128, 128, 255]);
    const grey = applyFilterOps(pixel(), [{ fn: "grayscale", amount: 1 }]);
    expect(grey[0]).toBe(grey[1]);
    expect(grey[1]).toBe(grey[2]);
    const desaturated = applyFilterOps(pixel(), [{ fn: "saturate", amount: 0 }]);
    expect(Math.abs(desaturated[0]! - desaturated[2]!)).toBeLessThanOrEqual(1);
    // Results clamp instead of overflowing.
    expect(Array.from(applyFilterOps(pixel(), [{ fn: "brightness", amount: 3 }]))).toEqual([255, 255, 150, 255]);
  });

  it("uses identity matrices for neutral amounts", () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    for (const op of [
      { fn: "saturate", amount: 1 },
      { fn: "hue-rotate", amount: 0 },
      { fn: "sepia", amount: 0 },
      { fn: "grayscale", amount: 0 },
    ] as const) {
      opMatrix(op).forEach((value, index) => expect(value).toBeCloseTo(identity[index]!, 3));
    }
  });
});

describe("input and output", () => {
  it("validates type and size with friendly messages", () => {
    expect(validateImageFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(validateImageFile({ type: "image/gif", size: 1000 })).toMatch(/JPEG, PNG or WebP/);
    expect(validateImageFile({ type: "image/jpeg", size: 6 * 1024 * 1024 })).toMatch(/6\.0 MB.*5 MB or smaller/);
    expect(validateImageFile({ type: "image/webp", size: 0 })).toMatch(/empty/);
  });

  it("formats sizes and file names", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(180_000)).toBe("176 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
    expect(outputFileName("Event cover", "image/webp")).toBe("event-cover.webp");
    expect(outputFileName("event-cover", "image/jpeg")).toBe("event-cover.jpg");
    expect(outputFileName("***", "image/png")).toBe("photo.png");
  });
});
