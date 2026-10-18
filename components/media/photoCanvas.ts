/**
 * Browser-only canvas helpers for the photo editor. The geometry lives in
 * photoMath.ts; this file only draws and encodes. Uploads are still decoded,
 * re-encoded, and stripped on the server (lib/imageValidation.ts) — nothing
 * here is a safety boundary.
 */
import {
  OUTPUT_QUALITY,
  applyFilterOps,
  drawScale,
  rotationRadians,
  type CropState,
  type Dims,
  type FilterOp,
  cssFilter,
} from "./photoMath";

/** Draw the image for a crop with the context origin at the frame centre (output pixel units). */
export function drawCropped(context: CanvasRenderingContext2D, image: CanvasImageSource, crop: CropState, dims: Dims) {
  const scale = drawScale(crop, dims);
  const width = dims.imageWidth * scale;
  const height = dims.imageHeight * scale;
  context.save();
  context.translate(crop.offset.x, crop.offset.y);
  context.rotate(rotationRadians(crop));
  if (crop.flipX) context.scale(-1, 1);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}

let canvasFilterSupport: boolean | null = null;

/** Whether `context.filter` actually changes pixels (Safari long lacked it). */
export function supportsCanvasFilter() {
  if (canvasFilterSupport !== null) return canvasFilterSupport;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || typeof context.filter !== "string") {
      canvasFilterSupport = false;
      return false;
    }
    context.filter = "brightness(0)";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 1, 1);
    canvasFilterSupport = (context.getImageData(0, 0, 1, 1).data[0] ?? 255) < 10;
  } catch {
    canvasFilterSupport = false;
  }
  return canvasFilterSupport;
}

/** Render the final output canvas for a crop and set of filter ops. */
export function renderOutput(image: HTMLImageElement, crop: CropState, outputWidth: number, outputHeight: number, ops: FilterOp[]) {
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d", { willReadFrequently: ops.length > 0 && !supportsCanvasFilter() });
  if (!context) throw new Error("Canvas is not available.");
  context.fillStyle = "#000000";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const useNativeFilter = ops.length > 0 && supportsCanvasFilter();
  if (useNativeFilter) context.filter = cssFilter(ops);
  context.translate(outputWidth / 2, outputHeight / 2);
  drawCropped(context, image, crop, {
    imageWidth: image.naturalWidth,
    imageHeight: image.naturalHeight,
    frameWidth: outputWidth,
    frameHeight: outputHeight,
  });
  if (ops.length > 0 && !useNativeFilter) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    const pixels = context.getImageData(0, 0, outputWidth, outputHeight);
    applyFilterOps(pixels.data, ops);
    context.putImageData(pixels, 0, 0);
  }
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Encode as WebP, or JPEG where the browser can't encode WebP. */
export async function encodeCanvas(canvas: HTMLCanvasElement) {
  const webp = await toBlob(canvas, "image/webp", OUTPUT_QUALITY);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob(canvas, "image/jpeg", OUTPUT_QUALITY);
  if (!jpeg) throw new Error("This browser could not export the image.");
  return jpeg;
}

/** Load an image; `crossOrigin` lets the canvas read pixels from an existing cover URL. */
export function loadImage(url: string, options: { crossOrigin?: boolean } = {}) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (options.crossOrigin) image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) reject(new Error("empty"));
      else resolve(image);
    };
    image.onerror = () => reject(new Error("load"));
    image.src = url;
  });
}

/** False when the browser treats the image as cross-origin and blocks reading it. */
export function canReadPixels(image: HTMLImageElement) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(image, 0, 0, 1, 1);
    context.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

/** A small centre-cropped JPEG data URL used for the look thumbnails. */
export function makeThumbnail(image: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  try {
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return "";
  }
}
