import type { RegistrationFieldType } from "@prisma/client";
import { fieldSettingsSchema, fieldTypeMeta, generateFieldKey, settingsForType, triggerChoices, type FieldSettings } from "@/lib/registrationFields";

/*
 * Pure helpers for the organiser's registration form builder: summaries,
 * choice-list edits, drafts and "show only if" checks. No React, so they can
 * be unit tested in Node. Nothing here ever surfaces a question's internal key.
 */

export type BuilderField = {
  id: string;
  key: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  sortOrder: number;
  options: string[];
  helpText: string;
  placeholder: string;
  settings: FieldSettings;
};

export const MAX_LABEL = 200;
export const MAX_HELP = 300;
export const MAX_PLACEHOLDER = 120;
export const MAX_CHOICE = 200;
export const MAX_CHOICES = 100;

/* ---------- Summaries ---------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-15" → "15 Oct 2026" without going through Date (no time-zone drift). */
export function formatIsoDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : value;
}

function rangeText(min: string | undefined, max: string | undefined, unit = ""): string | null {
  const suffix = unit ? ` ${unit}` : "";
  if (min != null && max != null) return `${min}–${max}${suffix}`;
  if (min != null) return `At least ${min}${suffix}`;
  if (max != null) return `Up to ${max}${suffix}`;
  return null;
}

export function joinOr(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}

/** One-line extras for a question card, e.g. ["4 choices", "Other allowed", "Up to 2"]. */
export function summarizeField(field: Pick<BuilderField, "type" | "options" | "settings">, all: readonly Pick<BuilderField, "key" | "label">[] = []): string[] {
  const caps = fieldTypeMeta(field.type);
  const settings = settingsForType(field.type, field.settings);
  const parts: string[] = [];
  if (caps.hasOptions) {
    parts.push(`${field.options.length} ${field.options.length === 1 ? "choice" : "choices"}`);
    if (settings.allowOther) parts.push("Other allowed");
    if (settings.maxSelections != null) parts.push(`Up to ${settings.maxSelections}`);
  }
  if (caps.isText) {
    const text = rangeText(settings.minLength?.toString(), settings.maxLength?.toString(), "characters");
    if (text) parts.push(text);
  }
  if (caps.supportsRange) {
    const text = rangeText(settings.min?.toString(), settings.max?.toString());
    if (text) parts.push(text);
  }
  if (caps.supportsDateRange) {
    const from = settings.minDate ? formatIsoDay(settings.minDate) : undefined;
    const to = settings.maxDate ? formatIsoDay(settings.maxDate) : undefined;
    if (from && to) parts.push(`${from} – ${to}`);
    else if (from) parts.push(`From ${from}`);
    else if (to) parts.push(`Until ${to}`);
  }
  if (settings.showIf) {
    const trigger = all.find((item) => item.key === settings.showIf!.fieldKey);
    parts.push(`Shows if: ${trigger ? trigger.label : "a removed question"} is ${joinOr(settings.showIf.values)}`);
  }
  return parts;
}

/* ---------- Choice lists ---------- */

export function moveItem<T>(list: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((item, i) => (i === index ? value : item));
}

/** Splits pasted text into choices: one per line (or tab), bullets and numbering removed. */
export function splitChoiceList(text: string): string[] {
  return text
    .split(/\r?\n|\t/)
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .map((line) => line.slice(0, MAX_CHOICE));
}

const norm = (value: string) => value.trim().toLocaleLowerCase();

/** Inserts pasted choices at `index` (replacing that row), skipping ones already on the list. */
export function insertChoices(list: readonly string[], index: number, pasted: readonly string[], replace = true): string[] {
  const keep = list.filter((_, i) => !(replace && i === index));
  const seen = new Set(keep.map(norm).filter(Boolean));
  const fresh: string[] = [];
  for (const choice of pasted) {
    if (seen.has(norm(choice))) continue;
    seen.add(norm(choice));
    fresh.push(choice);
  }
  const at = Math.min(Math.max(index, 0), keep.length);
  return [...keep.slice(0, at), ...fresh, ...keep.slice(at)].slice(0, MAX_CHOICES);
}

/** Indexes of rows that repeat an earlier choice (ignoring case and spaces). */
export function duplicateChoiceIndexes(list: readonly string[]): Set<number> {
  const seen = new Set<string>();
  const dupes = new Set<number>();
  list.forEach((choice, index) => {
    const key = norm(choice);
    if (!key) return;
    if (seen.has(key)) dupes.add(index);
    else seen.add(key);
  });
  return dupes;
}

/** Trimmed, non-empty, first-wins unique choices: what actually gets saved. */
export function cleanChoices(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const choice = raw.trim();
    if (!choice || seen.has(norm(choice))) continue;
    seen.add(norm(choice));
    out.push(choice);
  }
  return out;
}

/* ---------- Labels ---------- */

/** "Dietary needs" → "Dietary needs (copy)", then "(copy 2)", … never longer than the label limit. */
export function duplicateLabel(label: string, existing: readonly string[]): string {
  const base = label.trim().replace(/\s*\(copy(?: \d+)?\)$/i, "") || "Question";
  const taken = new Set(existing.map(norm));
  for (let n = 1; n < 1000; n += 1) {
    const suffix = n === 1 ? " (copy)" : ` (copy ${n})`;
    const candidate = `${base.slice(0, MAX_LABEL - suffix.length)}${suffix}`;
    if (!taken.has(norm(candidate))) return candidate;
  }
  return `${base.slice(0, MAX_LABEL - 7)} (copy)`;
}

export function hasLabel(fields: readonly Pick<BuilderField, "label">[], label: string): boolean {
  return fields.some((field) => norm(field.label) === norm(label));
}

/** The key the server will generate for a new question; only used for optimistic local state. */
export function predictKey(label: string, fields: readonly Pick<BuilderField, "key">[]): string {
  return generateFieldKey(label, fields.map((field) => field.key));
}

/* ---------- Conditional logic ---------- */

export type LogicProblem =
  | { kind: "later"; triggerId: string; triggerLabel: string }
  | { kind: "missing" }
  | { kind: "cannotTrigger"; triggerId: string; triggerLabel: string };

/** Rules that the public form will ignore: the trigger is gone, below this question, or no longer a choice question. */
export function findLogicProblems(fields: readonly BuilderField[]): Map<string, LogicProblem> {
  const problems = new Map<string, LogicProblem>();
  fields.forEach((field, index) => {
    const rule = field.settings.showIf;
    if (!rule) return;
    const triggerIndex = fields.findIndex((item) => item.key === rule.fieldKey);
    const trigger = fields[triggerIndex];
    if (!trigger || trigger.id === field.id) problems.set(field.id, { kind: "missing" });
    else if (triggerIndex > index) problems.set(field.id, { kind: "later", triggerId: trigger.id, triggerLabel: trigger.label });
    else if (!fieldTypeMeta(trigger.type).canTrigger) problems.set(field.id, { kind: "cannotTrigger", triggerId: trigger.id, triggerLabel: trigger.label });
  });
  return problems;
}

/** Order of ids with `fieldId` moved to sit directly below `triggerId`. */
export function orderWithFieldBelow(ids: readonly string[], fieldId: string, triggerId: string): string[] {
  const rest = ids.filter((id) => id !== fieldId);
  const at = rest.indexOf(triggerId);
  if (at < 0 || !ids.includes(fieldId)) return [...ids];
  return [...rest.slice(0, at + 1), fieldId, ...rest.slice(at + 1)];
}

/** Questions above `index` that can drive a "show only if" rule (and already have a saved key). */
export function triggerCandidates(fields: readonly BuilderField[], index: number): BuilderField[] {
  return fields.slice(0, Math.max(index, 0)).filter((field) => field.key && fieldTypeMeta(field.type).canTrigger);
}

/** Later questions whose rule uses an answer this question would no longer offer. */
export function affectedDependents(fields: readonly BuilderField[], key: string, type: RegistrationFieldType, options: readonly string[]): Array<{ id: string; label: string; missing: string[] }> {
  if (!key) return [];
  const available = fieldTypeMeta(type).canTrigger ? triggerChoices({ type, options }) : [];
  return fields
    .filter((field) => field.settings.showIf?.fieldKey === key)
    .map((field) => ({ id: field.id, label: field.label, missing: field.settings.showIf!.values.filter((value) => !available.includes(value)) }))
    .filter((item) => item.missing.length > 0);
}

/* ---------- Drafts ---------- */

export type LimitKey = "minLength" | "maxLength" | "min" | "max" | "minDate" | "maxDate" | "maxSelections";

export type QuestionDraft = {
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  options: string[];
  helpText: string;
  placeholder: string;
  allowOther: boolean;
  /** Raw input text, so half-typed numbers don't jump around. */
  limits: Record<LimitKey, string>;
  showIf: { fieldKey: string; values: string[] } | null;
};

const EMPTY_LIMITS: Record<LimitKey, string> = { minLength: "", maxLength: "", min: "", max: "", minDate: "", maxDate: "", maxSelections: "" };

export function newDraft(type: RegistrationFieldType): QuestionDraft {
  return {
    label: "",
    type,
    required: false,
    options: fieldTypeMeta(type).hasOptions ? ["", ""] : [],
    helpText: "",
    placeholder: "",
    allowOther: false,
    limits: { ...EMPTY_LIMITS },
    showIf: null,
  };
}

export function draftFromField(field: Pick<BuilderField, "label" | "type" | "required" | "options" | "helpText" | "placeholder" | "settings">): QuestionDraft {
  const s = field.settings;
  const text = (value: number | string | undefined) => (value == null ? "" : String(value));
  return {
    label: field.label,
    type: field.type,
    required: field.required,
    options: [...field.options],
    helpText: field.helpText,
    placeholder: field.placeholder,
    allowOther: Boolean(s.allowOther),
    limits: {
      minLength: text(s.minLength),
      maxLength: text(s.maxLength),
      min: text(s.min),
      max: text(s.max),
      minDate: text(s.minDate),
      maxDate: text(s.maxDate),
      maxSelections: text(s.maxSelections),
    },
    showIf: s.showIf ? { fieldKey: s.showIf.fieldKey, values: [...s.showIf.values] } : null,
  };
}

export function draftsEqual(a: QuestionDraft, b: QuestionDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type DraftErrorKey = "label" | "options" | "helpText" | "placeholder" | "showIf" | LimitKey | "form";
export type DraftErrors = Partial<Record<DraftErrorKey, string>>;

export type SaveableQuestion = {
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  options: string[];
  helpText: string;
  placeholder: string;
  settings: FieldSettings;
};

function readNumber(raw: string, integer: boolean, errors: DraftErrors, key: LimitKey): number | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    errors[key] = integer ? "Enter a whole number." : "Enter a number.";
    return undefined;
  }
  if (integer && (!Number.isInteger(number) || number < 0)) {
    errors[key] = "Enter a whole number.";
    return undefined;
  }
  return number;
}

/** Settings implied by a draft for its current type, ignoring anything half-typed or invalid. */
function draftSettings(draft: QuestionDraft, errors: DraftErrors): FieldSettings {
  const caps = fieldTypeMeta(draft.type);
  const settings: FieldSettings = {};
  const { limits } = draft;
  if (caps.isText) {
    const minLength = readNumber(limits.minLength, true, errors, "minLength");
    const maxLength = readNumber(limits.maxLength, true, errors, "maxLength");
    if (minLength != null) settings.minLength = minLength;
    if (maxLength != null) {
      if (maxLength < 1) errors.maxLength = "Allow at least 1 character.";
      else settings.maxLength = maxLength;
    }
  }
  if (caps.supportsRange) {
    const min = readNumber(limits.min, false, errors, "min");
    const max = readNumber(limits.max, false, errors, "max");
    if (min != null) settings.min = min;
    if (max != null) settings.max = max;
  }
  if (caps.supportsDateRange) {
    if (limits.minDate) settings.minDate = limits.minDate;
    if (limits.maxDate) settings.maxDate = limits.maxDate;
  }
  if (caps.supportsMaxSelections) {
    const maxSelections = readNumber(limits.maxSelections, true, errors, "maxSelections");
    if (maxSelections != null) {
      if (maxSelections < 1) errors.maxSelections = "Allow at least 1 choice.";
      else settings.maxSelections = maxSelections;
    }
  }
  if (caps.supportsOther && draft.allowOther) settings.allowOther = true;
  if (draft.showIf) settings.showIf = { fieldKey: draft.showIf.fieldKey, values: [...draft.showIf.values] };
  return settingsForType(draft.type, settings);
}

/** Validates a draft the way the server will, with friendlier messages tied to each input. */
export function validateDraft(draft: QuestionDraft): { ok: true; value: SaveableQuestion } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const caps = fieldTypeMeta(draft.type);
  const label = draft.label.trim();
  if (!label) errors.label = "Write the question.";
  else if (label.length > MAX_LABEL) errors.label = `Keep the question under ${MAX_LABEL} characters.`;
  const helpText = draft.helpText.trim();
  if (helpText.length > MAX_HELP) errors.helpText = `Keep the help text under ${MAX_HELP} characters.`;
  const placeholder = caps.isText ? draft.placeholder.trim() : "";
  if (placeholder.length > MAX_PLACEHOLDER) errors.placeholder = `Keep the example under ${MAX_PLACEHOLDER} characters.`;

  const options = caps.hasOptions ? cleanChoices(draft.options) : [];
  if (caps.hasOptions) {
    if (options.length === 0) errors.options = "Add at least one choice.";
    else if (options.length > MAX_CHOICES) errors.options = `Use at most ${MAX_CHOICES} choices.`;
    else if (options.some((choice) => choice.length > MAX_CHOICE)) errors.options = `Keep each choice under ${MAX_CHOICE} characters.`;
  }

  const settings = draftSettings(draft, errors);
  if (draft.showIf && draft.showIf.values.length === 0) errors.showIf = "Tick at least one answer that shows this question.";
  if (settings.maxSelections != null && caps.hasOptions && options.length > 0) {
    const available = options.length + (settings.allowOther ? 1 : 0);
    if (settings.maxSelections > available) errors.maxSelections = `There ${available === 1 ? "is only 1 choice" : `are only ${available} choices`}.`;
  }

  const parsed = fieldSettingsSchema.safeParse(settings);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path[0];
      const key: DraftErrorKey =
        typeof path === "string" && path in EMPTY_LIMITS ? (path as LimitKey) : path === "showIf" ? "showIf" : settings.minDate && settings.maxDate && settings.minDate > settings.maxDate ? "maxDate" : settings.min != null && settings.max != null && settings.min > settings.max ? "max" : settings.minLength != null && settings.maxLength != null ? "maxLength" : "form";
      errors[key] ??= issue.message;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { label, type: draft.type, required: draft.required, options, helpText, placeholder, settings: parsed.success ? parsed.data : settings } };
}

/** A best-effort question from an in-progress draft, for the live preview. */
export function previewFromDraft(draft: QuestionDraft): Pick<BuilderField, "label" | "type" | "required" | "options" | "helpText" | "placeholder" | "settings"> {
  const caps = fieldTypeMeta(draft.type);
  return {
    label: draft.label.trim() || "Untitled question",
    type: draft.type,
    required: draft.required,
    options: caps.hasOptions ? cleanChoices(draft.options) : [],
    helpText: draft.helpText.trim(),
    placeholder: caps.isText ? draft.placeholder.trim() : "",
    settings: draftSettings(draft, {}),
  };
}

/** Human names for the settings a type switch would drop, e.g. ["choices", "character limits"]. */
export function droppedByTypeChange(draft: QuestionDraft, nextType: RegistrationFieldType): string[] {
  const from = fieldTypeMeta(draft.type);
  const to = fieldTypeMeta(nextType);
  const dropped: string[] = [];
  const has = (key: LimitKey) => draft.limits[key].trim() !== "";
  if (from.hasOptions && !to.hasOptions && cleanChoices(draft.options).length > 0) dropped.push("choices");
  if (draft.allowOther && from.supportsOther && !to.supportsOther) dropped.push("the “Other” answer");
  const textLimits = (type: RegistrationFieldType) => fieldTypeMeta(type).isText && type !== "EMAIL" && type !== "PHONE";
  if ((has("minLength") || has("maxLength")) && textLimits(draft.type) && !textLimits(nextType)) dropped.push("character limits");
  if ((has("min") || has("max")) && from.supportsRange && !to.supportsRange) dropped.push("number limits");
  if ((has("minDate") || has("maxDate")) && from.supportsDateRange && !to.supportsDateRange) dropped.push("date limits");
  if (has("maxSelections") && from.supportsMaxSelections && !to.supportsMaxSelections) dropped.push("the choice limit");
  if (draft.placeholder.trim() && from.isText && !to.isText) dropped.push("the example answer");
  return dropped;
}
