import type { RegistrationFieldType } from "@prisma/client";

/* Pure helpers for the event dashboard Feedback tab (unit tested). */

const NUMERIC_OPTION = /^-?\d+(?:\.\d+)?$/;
const RATING_TYPES: ReadonlySet<RegistrationFieldType> = new Set<RegistrationFieldType>(["RADIO", "SELECT"]);
const TEXT_TYPES: ReadonlySet<RegistrationFieldType> = new Set<RegistrationFieldType>(["TEXT", "TEXTAREA"]);

/** Dots drawn per rating row; counts are scaled to fit. */
export const RATING_DOTS = 10;

/**
 * Ordered word scales, best first. A question whose options all come from one
 * of these (in any order, any case) reads as a rating, e.g. the built-in
 * feedback templates' "Excellent / Good / Okay / Poor".
 */
export const WORD_SCALES: readonly (readonly string[])[] = [
  ["excellent", "very good", "good", "okay", "fair", "average", "poor", "very poor", "bad"],
  ["definitely", "very likely", "probably", "likely", "maybe", "not sure", "unlikely", "probably not", "very unlikely", "definitely not"],
  ["strongly agree", "agree", "neutral", "disagree", "strongly disagree"],
  ["very satisfied", "satisfied", "neutral", "dissatisfied", "very dissatisfied"],
];

export type RatingScale = { kind: "numeric" } | { kind: "words"; order: readonly string[] };

/** How a single-choice question's options form a scale, or null when they don't. */
export function ratingScale(field: { type: RegistrationFieldType; options: readonly string[] }): RatingScale | null {
  if (!RATING_TYPES.has(field.type)) return null;
  const options = field.options.map((option) => option.trim()).filter(Boolean);
  if (options.length < 2) return null;
  if (options.every((option) => NUMERIC_OPTION.test(option))) return { kind: "numeric" };
  const lower = options.map((option) => option.toLowerCase());
  const scale = WORD_SCALES.find((words) => lower.every((option) => words.includes(option)));
  return scale ? { kind: "words", order: scale } : null;
}

/** A single-choice question on a numeric ("1".."5") or known word scale reads as a rating. */
export function isRatingField(field: { type: RegistrationFieldType; options: readonly string[] }) {
  return ratingScale(field) !== null;
}

export function isTextField(field: { type: RegistrationFieldType }) {
  return TEXT_TYPES.has(field.type);
}

export type RatingRow = { value: string; count: number; dots: number };
/** `average` is only set for numeric scales; `top` is the most common answer. */
export type RatingInsight = { fieldId: string; label: string; rows: RatingRow[]; total: number; average: number | null; top: string | null };
export type TextInsight = { fieldId: string; label: string; total: number; recent: string[] };
/** Pre-aggregated, anonymous summary passed from the server to the Responses card. */
export type FeedbackInsights = { responseCount: number; ratings: RatingInsight[]; texts: TextInsight[] };

/**
 * One row per option, highest rating first. Answers that no longer match an
 * option (the question was edited after people answered) are ignored so the
 * rows and the total always agree.
 */
export function ratingDistribution(options: readonly string[], counts: Readonly<Record<string, number>>, dots = RATING_DOTS, scale: RatingScale = { kind: "numeric" }) {
  const unique = [...new Set(options.map((option) => option.trim()))];
  const ordered =
    scale.kind === "numeric"
      ? unique.sort((a, b) => Number(b) - Number(a))
      : unique.sort((a, b) => scale.order.indexOf(a.toLowerCase()) - scale.order.indexOf(b.toLowerCase()));
  const raw = ordered.map((value) => ({ value, count: Math.max(0, Math.floor(counts[value] ?? 0)) }));
  const max = raw.reduce((highest, row) => Math.max(highest, row.count), 0);
  const rows: RatingRow[] = raw.map((row) => ({
    ...row,
    dots: max === 0 || row.count === 0 ? 0 : Math.max(1, Math.round((row.count / max) * dots)),
  }));
  const total = raw.reduce((sum, row) => sum + row.count, 0);
  const average = total === 0 || scale.kind !== "numeric" ? null : raw.reduce((sum, row) => sum + Number(row.value) * row.count, 0) / total;
  // Ties go to the better answer (rows are best first).
  const top = total === 0 ? null : raw.reduce((best, row) => (row.count > best.count ? row : best)).value;
  return { rows, total, average, top };
}

/** "Rating 1–5" for numeric scales, otherwise a plain-language answer type. */
export function questionTypeLabel(field: { type: RegistrationFieldType; options: readonly string[] }) {
  const scale = ratingScale(field);
  if (scale?.kind === "numeric") {
    const values = field.options.map((option) => Number(option.trim()));
    return `Rating ${Math.min(...values)}–${Math.max(...values)}`;
  }
  if (scale?.kind === "words") {
    const ordered = [...field.options].map((option) => option.trim()).sort((a, b) => scale.order.indexOf(a.toLowerCase()) - scale.order.indexOf(b.toLowerCase()));
    return `Rating ${ordered[0]}–${ordered[ordered.length - 1]}`;
  }
  return FIELD_TYPE_LABELS[field.type] ?? field.type;
}

export const FIELD_TYPE_LABELS: Partial<Record<RegistrationFieldType, string>> = {
  TEXT: "Short answer",
  TEXTAREA: "Long answer",
  SELECT: "Dropdown",
  MULTI_SELECT: "Pick several",
  RADIO: "Pick one",
  CHECKBOX: "Yes / no",
  NUMBER: "Number",
};
