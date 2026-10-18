import type { RegistrationFieldDefinition } from "@/components/rsvp/registrationTypes";
import { DEFAULT_MAX_LENGTH, OTHER_MAX_LENGTH, fieldTypeMeta, visibleFieldKeys } from "@/lib/registrationFields";
import { isValidInternationalPhone, normalizeInternationalPhone } from "@/lib/phone";

/*
 * Pure helpers behind the registration question form (public sign-up and the
 * organiser add/edit attendee dialogs). They mirror the server rules in
 * lib/rsvpCore.ts `validateAndNormalizeAnswers` so people see a friendly
 * message before submitting; the server stays the authority.
 */

type Question = Pick<RegistrationFieldDefinition, "key" | "label" | "type" | "required" | "options" | "settings">;

/** The "Other" free-text answer for a choice question. */
export type OtherAnswer = { chosen: boolean; text: string };

/** Raw form state: answers as the controls hold them, plus "Other" answers kept apart. */
export type AnswerState = {
  answers: Record<string, unknown>;
  others: Record<string, OtherAnswer>;
};

/** Value the "Other" radio/option uses in the UI. Never submitted. */
export const OTHER_CHOICE = "__yuyu_other__";

export function allowsOther(field: Question): boolean {
  return Boolean(field.settings?.allowOther) && fieldTypeMeta(field.type).supportsOther && field.options.length > 0;
}

function isOption(field: Question, value: string) {
  return field.options.length === 0 || field.options.includes(value);
}

function stringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
}

/**
 * The value sent to the server for one question. "Other" sends the typed text
 * itself (single choice: the string; checkboxes: one extra array item).
 * Selections that are no longer options are dropped.
 */
export function submittedValue(field: Question, raw: unknown, other?: OtherAnswer): unknown {
  const useOther = allowsOther(field) && other?.chosen === true;
  const otherText = useOther ? other!.text.trim() : "";
  switch (field.type) {
    case "RADIO":
    case "SELECT": {
      if (useOther) return otherText;
      const value = typeof raw === "string" ? raw : "";
      return value && isOption(field, value) ? value : "";
    }
    case "MULTI_SELECT": {
      const picked = stringList(raw).filter((value) => isOption(field, value));
      if (otherText && !picked.includes(otherText)) picked.push(otherText);
      return picked;
    }
    default:
      return raw;
  }
}

/** Every question's submitted value, before visibility is applied. */
export function submittedAnswers(fields: readonly Question[], state: AnswerState): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = submittedValue(field, state.answers[field.key], state.others[field.key]);
    if (value !== undefined) result[field.key] = value;
  }
  return result;
}

/** Which questions are shown right now ("show only if" rules, evaluated like the server does). */
export function visibleQuestionKeys(fields: readonly Question[], state: AnswerState): Set<string> {
  return visibleFieldKeys(fields, submittedAnswers(fields, state));
}

/** The `answers` payload: submitted values of visible questions only. Hidden answers are never sent. */
export function buildAnswersPayload(fields: readonly Question[], state: AnswerState): Record<string, unknown> {
  const all = submittedAnswers(fields, state);
  const visible = visibleFieldKeys(fields, all);
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    if (visible.has(field.key) && field.key in all) payload[field.key] = all[field.key];
  }
  return payload;
}

/** Splits saved answers (e.g. an existing registration) into control values and "Other" text. */
export function initialAnswerState(fields: readonly Question[], answers: Record<string, unknown>): AnswerState {
  const result: AnswerState = { answers: { ...answers }, others: {} };
  for (const field of fields) {
    if (!allowsOther(field)) continue;
    const raw = answers[field.key];
    if (field.type === "MULTI_SELECT") {
      const list = stringList(raw);
      const extra = list.find((value) => value.trim() && !field.options.includes(value));
      if (extra) {
        result.answers[field.key] = list.filter((value) => field.options.includes(value));
        result.others[field.key] = { chosen: true, text: extra };
      }
    } else if (typeof raw === "string" && raw.trim() && !field.options.includes(raw)) {
      result.answers[field.key] = "";
      result.others[field.key] = { chosen: true, text: raw };
    }
  }
  return result;
}

/* ---------- Limits ---------- */

/** Character limits for a text-like question (built-in cap when none is set). */
export function textLimits(field: Question): { min?: number; max?: number } {
  if (field.type !== "TEXT" && field.type !== "TEXTAREA") return {};
  const cap = DEFAULT_MAX_LENGTH[field.type] ?? 5000;
  return {
    min: field.settings?.minLength || undefined,
    max: Math.min(field.settings?.maxLength ?? cap, 5000),
  };
}

/** "2026-10-15" → "15 Oct 2026" (no time-zone drift: the date is read as UTC). */
export function formatIsoDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function plural(count: number, word: string) {
  return `${count.toLocaleString("en-GB")} ${word}${count === 1 ? "" : "s"}`;
}

/** A short hint about the question's limits, or null when there is nothing to say. */
export function limitHint(field: Question): string | null {
  const settings = field.settings ?? {};
  switch (field.type) {
    case "TEXT":
    case "TEXTAREA":
      return settings.minLength ? `At least ${plural(settings.minLength, "character")}.` : null;
    case "NUMBER":
      if (settings.min != null && settings.max != null) return `Enter a number from ${settings.min} to ${settings.max}.`;
      if (settings.min != null) return `Enter ${settings.min} or more.`;
      if (settings.max != null) return `Enter ${settings.max} or less.`;
      return null;
    case "DATE":
      if (settings.minDate && settings.maxDate) return `Choose a date from ${formatIsoDate(settings.minDate)} to ${formatIsoDate(settings.maxDate)}.`;
      if (settings.minDate) return `Choose a date on or after ${formatIsoDate(settings.minDate)}.`;
      if (settings.maxDate) return `Choose a date on or before ${formatIsoDate(settings.maxDate)}.`;
      return null;
    case "MULTI_SELECT":
      return settings.maxSelections != null ? `Choose up to ${settings.maxSelections}.` : "Choose all that apply.";
    default:
      return null;
  }
}

/** Show a character counter once a custom limit is set or the answer gets close to the cap. */
export function shouldShowCounter(field: Question, length: number): boolean {
  const { max } = textLimits(field);
  if (max == null) return false;
  return field.settings?.maxLength != null || length >= max * 0.8;
}

/** How many choices are selected, counting a typed "Other". */
export function selectionCount(field: Question, raw: unknown, other?: OtherAnswer): number {
  const picked = stringList(raw).filter((value) => isOption(field, value)).length;
  return picked + (allowsOther(field) && other?.chosen ? 1 : 0);
}

/** Whether another checkbox can be ticked under "choose up to N". */
export function canSelectMore(field: Question, raw: unknown, other?: OtherAnswer): boolean {
  const max = field.settings?.maxSelections;
  return max == null || selectionCount(field, raw, other) < max;
}

/* ---------- Validation ---------- */

function isBlank(value: unknown) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/** A friendly message for one question's answer, or null when it is fine. Mirrors the server checks. */
export function validateQuestion(field: Question, raw: unknown, other?: OtherAnswer): string | null {
  const settings = field.settings ?? {};
  const usingOther = allowsOther(field) && other?.chosen === true;
  if (usingOther) {
    const text = other!.text.trim();
    if (!text) return "Type your answer for “Other”.";
    if (text.length > OTHER_MAX_LENGTH) return `Keep “Other” to ${plural(OTHER_MAX_LENGTH, "character")} or fewer.`;
  }
  const value = submittedValue(field, raw, other);

  switch (field.type) {
    case "TEXT":
    case "TEXTAREA": {
      const text = typeof value === "string" ? value.trim() : "";
      if (!text) return field.required ? "Please answer this question." : null;
      const { min, max } = textLimits(field);
      if (max != null && text.length > max) return `Use ${plural(max, "character")} or fewer.`;
      if (min != null && text.length < min) return `Use at least ${plural(min, "character")} (you have ${text.length}).`;
      return null;
    }
    case "EMAIL": {
      const text = typeof value === "string" ? value.trim().toLowerCase() : "";
      if (!text) return field.required ? "Please enter an email address." : null;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? null : "Enter a valid email address, like name@example.com.";
    }
    case "PHONE": {
      const text = typeof value === "string" ? normalizeInternationalPhone(value) : "";
      if (!text) return field.required ? "Please enter a phone number." : null;
      if (isValidInternationalPhone(text)) return null;
      return text.startsWith("+91") ? "Enter a valid 10-digit Indian mobile number." : "Enter a valid phone number, including the country code.";
    }
    case "RADIO":
    case "SELECT": {
      const text = typeof value === "string" ? value.trim() : "";
      if (!text) return field.required ? "Please choose an option." : null;
      return null;
    }
    case "MULTI_SELECT": {
      const count = new Set(stringList(value).map((item) => item.trim()).filter(Boolean)).size;
      if (count === 0) return field.required ? "Please choose at least one option." : null;
      if (settings.maxSelections != null && count > settings.maxSelections) return `Choose up to ${settings.maxSelections}.`;
      return null;
    }
    case "CHECKBOX":
      return field.required && value !== true ? "Please tick this box to continue." : null;
    case "NUMBER": {
      if (isBlank(value)) return field.required ? "Please enter a number." : null;
      const number = typeof value === "number" ? value : Number(String(value).trim());
      if (!Number.isFinite(number)) return "Enter a number.";
      if ((settings.min != null && number < settings.min) || (settings.max != null && number > settings.max)) return limitHint(field);
      return null;
    }
    case "DATE": {
      if (isBlank(value)) return field.required ? "Please choose a date." : null;
      const text = String(value).trim();
      const date = new Date(text);
      if (Number.isNaN(date.getTime())) return "Enter a valid date.";
      const day = date.toISOString().slice(0, 10);
      if ((settings.minDate && day < settings.minDate) || (settings.maxDate && day > settings.maxDate)) return limitHint(field);
      return null;
    }
    default:
      return null;
  }
}

/** Messages for every visible question that needs attention, keyed by question key. */
export function validateAnswerState(fields: readonly Question[], state: AnswerState): Record<string, string> {
  const visible = visibleQuestionKeys(fields, state);
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!visible.has(field.key)) continue;
    const message = validateQuestion(field, state.answers[field.key], state.others[field.key]);
    if (message) errors[field.key] = message;
  }
  return errors;
}

/** Name and email checks for the sign-up and attendee forms, shown before the server is asked. */
export function identityErrors(input: { name: string; email?: string; requireName: boolean; requireEmail: boolean }): { name?: string; email?: string } {
  const errors: { name?: string; email?: string } = {};
  if (input.requireName && !input.name.trim()) errors.name = "Please enter your name.";
  if (input.requireEmail) {
    const email = (input.email ?? "").trim();
    if (!email) errors.email = "Please enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address, like name@example.com.";
  }
  return errors;
}
