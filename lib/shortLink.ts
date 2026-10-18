import crypto from "crypto";

/**
 * Event short links live at the site root (`/aB3x9Kq`), beside organisation
 * slugs. Organisation slugs are lowercase-only, so every code carries at least
 * one uppercase letter and the two namespaces can never collide.
 */
export const SHORT_CODE_LENGTH = 7;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const SHORT_CODE_PATTERN = /^(?=.*[A-Z])[A-Za-z0-9]{7}$/;

/** True when a path segment has the shape of a short code (not whether one exists). */
export function isShortCodeShape(value: string): boolean {
  return SHORT_CODE_PATTERN.test(value);
}

/** A cryptographically random 7-character code containing at least one uppercase letter. */
export function generateShortCode(): string {
  const chars = Array.from({ length: SHORT_CODE_LENGTH }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]);
  // ~6% of draws have no uppercase letter; place one at a random position.
  if (!chars.some((char) => UPPERCASE.includes(char))) {
    chars[crypto.randomInt(SHORT_CODE_LENGTH)] = UPPERCASE[crypto.randomInt(UPPERCASE.length)];
  }
  return chars.join("");
}

/** The public path for a short code. */
export function shortLinkPath(code: string): string {
  return `/${code}`;
}
