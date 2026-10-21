/** Pure text helpers for email subjects and titles (no server dependencies). */

/** What the outbox accepts for a subject or title. */
export const NOTICE_TEXT_MAX = 200;

/** Shorten `text` to `max` characters with an ellipsis. */
export function shorten(text: string, max = NOTICE_TEXT_MAX) {
  const clean = text.trim();
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** "Prefix: title", with a long title shortened so the whole subject fits. */
export function noticeSubject(prefix: string, title: string) {
  return `${prefix}: ${shorten(title, NOTICE_TEXT_MAX - prefix.length - 2)}`;
}

/** "Title, suffix" (a series date's label), with the title shortened to fit. */
export function titleWith(title: string, suffix: string) {
  return `${shorten(title, NOTICE_TEXT_MAX - suffix.length - 2)}, ${suffix}`;
}

/** "Sat 4 Jan, 10:00 (Asia/Kolkata)": a start time in the event's own zone. */
export function whenLabel(start: Date, timeZone: string) {
  try {
    return `${start.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone })} (${timeZone})`;
  } catch {
    return start.toISOString();
  }
}
