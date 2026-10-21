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
