/**
 * Yuyu brand header for transactional email. Email clients get the hosted PNG
 * lockup (never inline SVG), from the public base URL, with fixed dimensions
 * and alt text so it degrades to the word "Yuyu" when images are blocked.
 */
export const EMAIL_INK = "#18181B";

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function emailBrandHeader(): string {
  return `<div style="background-color: #ffffff; padding: 24px; text-align: center; border-bottom: 1px solid #e7e6e2;"><img src="${baseUrl()}/brand/email-lockup.png" width="122" height="36" alt="Yuyu" style="display: inline-block; width: 122px; height: 36px; border: 0; outline: none; text-decoration: none;"></div>`;
}
