/**
 * Returns a normalised http(s) URL that is safe to render as a link, or null.
 * Rejects javascript:, data: and any other scheme, plus anything unparseable.
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
