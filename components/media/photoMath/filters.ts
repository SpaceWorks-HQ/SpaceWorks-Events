import { clamp } from "@/components/media/photoMath/crop";

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
