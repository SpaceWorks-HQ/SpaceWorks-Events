import { z } from "zod";
import type { RegistrationFieldType } from "@prisma/client";

/*
 * Shared rules for registration questions, used by the form builder, the
 * public sign-up form and server-side answer validation. Client-safe (no
 * server imports). Organisers never see a question's internal `key`: it is
 * generated from the question text and stays fixed once answers exist.
 */

export type FieldTypeMeta = {
  type: RegistrationFieldType;
  /** What organisers see instead of the enum name. */
  label: string;
  description: string;
  hasOptions: boolean;
  /** Text-like: placeholder and length limits apply. */
  isText: boolean;
  supportsOther: boolean;
  supportsRange: boolean;
  supportsDateRange: boolean;
  supportsMaxSelections: boolean;
  /** Can be used as the "show only if" trigger for later questions. */
  canTrigger: boolean;
};

const meta = (type: RegistrationFieldType, label: string, description: string, caps: Partial<Omit<FieldTypeMeta, "type" | "label" | "description">> = {}): FieldTypeMeta => ({
  type,
  label,
  description,
  hasOptions: false,
  isText: false,
  supportsOther: false,
  supportsRange: false,
  supportsDateRange: false,
  supportsMaxSelections: false,
  canTrigger: false,
  ...caps,
});

export const FIELD_TYPES: readonly FieldTypeMeta[] = [
  meta("TEXT", "Short answer", "A name, a company, one line of text", { isText: true }),
  meta("TEXTAREA", "Paragraph", "Longer answers like questions or notes", { isText: true }),
  meta("RADIO", "Multiple choice", "Pick one from a short list", { hasOptions: true, supportsOther: true, canTrigger: true }),
  meta("SELECT", "Dropdown", "Pick one from a longer list", { hasOptions: true, supportsOther: true, canTrigger: true }),
  meta("MULTI_SELECT", "Checkboxes", "Pick as many as apply", { hasOptions: true, supportsOther: true, supportsMaxSelections: true, canTrigger: true }),
  meta("CHECKBOX", "Yes / no", "A single tick, like a consent", { canTrigger: true }),
  meta("EMAIL", "Email", "Checked to look like an email address", { isText: true }),
  meta("PHONE", "Phone", "International phone number", { isText: true }),
  meta("NUMBER", "Number", "Whole or decimal number, with optional limits", { supportsRange: true }),
  meta("DATE", "Date", "A calendar date, with optional earliest/latest", { supportsDateRange: true }),
];

export function fieldTypeMeta(type: RegistrationFieldType): FieldTypeMeta {
  return FIELD_TYPES.find((item) => item.type === type) ?? FIELD_TYPES[0]!;
}

/* ---------- Settings ---------- */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-15");

export const fieldSettingsSchema = z
  .object({
    minLength: z.number().int().min(0).max(5000).optional(),
    maxLength: z.number().int().min(1).max(5000).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    minDate: isoDate.optional(),
    maxDate: isoDate.optional(),
    maxSelections: z.number().int().min(1).max(100).optional(),
    /** Adds an "Other" choice with a short free-text answer. */
    allowOther: z.boolean().optional(),
    /** Show this question only when an earlier question's answer is one of `values`. */
    showIf: z
      .object({
        fieldKey: z.string().min(1).max(64),
        values: z.array(z.string().min(1).max(200)).min(1).max(100),
      })
      .optional(),
  })
  .strict()
  .refine((s) => s.minLength == null || s.maxLength == null || s.minLength <= s.maxLength, { message: "The minimum length can't be more than the maximum." })
  .refine((s) => s.min == null || s.max == null || s.min <= s.max, { message: "The minimum can't be more than the maximum." })
  .refine((s) => s.minDate == null || s.maxDate == null || s.minDate <= s.maxDate, { message: "The earliest date can't be after the latest." });

export type FieldSettings = z.infer<typeof fieldSettingsSchema>;

/** Reads stored settings defensively; anything invalid is ignored rather than trusted. */
export function parseFieldSettings(value: unknown): FieldSettings {
  const parsed = fieldSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

/** Drops settings that don't apply to a type, so switching type never leaves stale rules behind. */
export function settingsForType(type: RegistrationFieldType, settings: FieldSettings): FieldSettings {
  const caps = fieldTypeMeta(type);
  const next: FieldSettings = {};
  if (caps.isText && type !== "EMAIL" && type !== "PHONE") {
    if (settings.minLength != null) next.minLength = settings.minLength;
    if (settings.maxLength != null) next.maxLength = settings.maxLength;
  }
  if (caps.supportsRange) {
    if (settings.min != null) next.min = settings.min;
    if (settings.max != null) next.max = settings.max;
  }
  if (caps.supportsDateRange) {
    if (settings.minDate) next.minDate = settings.minDate;
    if (settings.maxDate) next.maxDate = settings.maxDate;
  }
  if (caps.supportsMaxSelections && settings.maxSelections != null) next.maxSelections = settings.maxSelections;
  if (caps.supportsOther && settings.allowOther) next.allowOther = true;
  if (settings.showIf) next.showIf = settings.showIf;
  return next;
}

/** Text that falls back to the built-in caps when no custom limit is set. */
export const DEFAULT_MAX_LENGTH: Partial<Record<RegistrationFieldType, number>> = { TEXT: 200, TEXTAREA: 5000 };
export const OTHER_MAX_LENGTH = 200;

/* ---------- Keys ---------- */

/** "Dietary needs?" → "dietary_needs"; unique within `taken` by adding _2, _3… */
export function generateFieldKey(label: string, taken: Iterable<string>): string {
  const base =
    label
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "question";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 10_000; n += 1) {
    const candidate = `${base}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}_${Date.now().toString(36)}`;
}

/* ---------- Conditional logic ---------- */

type LogicField = { key: string; type: RegistrationFieldType; settings?: FieldSettings };

/** The answer values a trigger question currently has, as strings ("Yes"/"No" for yes/no). */
export function triggerValues(type: RegistrationFieldType, raw: unknown): string[] {
  if (type === "CHECKBOX") return raw === true || raw === "on" ? ["Yes"] : ["No"];
  if (Array.isArray(raw)) return raw.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

/**
 * Whether each question is shown for the given answers. A question with a
 * `showIf` is visible only when its trigger is itself visible and answered
 * with one of the chosen values. A broken rule (the trigger was deleted or
 * moved below this question) is ignored, so the question simply shows.
 */
export function visibleFieldKeys(fields: readonly LogicField[], answers: Record<string, unknown>): Set<string> {
  const visible = new Set<string>();
  const seen = new Map<string, LogicField>();
  for (const field of fields) {
    const rule = field.settings?.showIf;
    const trigger = rule ? seen.get(rule.fieldKey) : undefined;
    if (!rule || !trigger) {
      visible.add(field.key);
    } else if (visible.has(trigger.key)) {
      const values = triggerValues(trigger.type, answers[trigger.key]);
      if (values.some((value) => rule.values.includes(value))) visible.add(field.key);
    }
    seen.set(field.key, field);
  }
  return visible;
}

/** The choices a trigger question offers, for the builder's "show only if" picker. */
export function triggerChoices(field: { type: RegistrationFieldType; options: readonly string[] }): string[] {
  if (field.type === "CHECKBOX") return ["Yes", "No"];
  return [...field.options];
}

/* ---------- Ready-made questions ---------- */

export type QuestionTemplate = {
  id: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  options?: string[];
  helpText?: string;
  placeholder?: string;
  settings?: FieldSettings;
};

export const QUESTION_TEMPLATES: readonly QuestionTemplate[] = [
  { id: "company", label: "Organisation or company", type: "TEXT", required: false, placeholder: "Where you work or study" },
  { id: "role", label: "Job title or role", type: "TEXT", required: false },
  { id: "phone", label: "Phone number", type: "PHONE", required: false, helpText: "Only used if we need to reach you about this event." },
  { id: "dietary", label: "Dietary needs", type: "MULTI_SELECT", required: false, options: ["Vegetarian", "Vegan", "Gluten-free", "Halal", "No nuts"], settings: { allowOther: true } },
  { id: "accessibility", label: "Accessibility needs", type: "TEXTAREA", required: false, helpText: "Tell us anything that would make the event easier to attend.", settings: { maxLength: 1000 } },
  { id: "tshirt", label: "T-shirt size", type: "SELECT", required: false, options: ["XS", "S", "M", "L", "XL", "XXL"] },
  { id: "heard", label: "How did you hear about this event?", type: "RADIO", required: false, options: ["Friend or colleague", "Social media", "Newsletter", "Our website"], settings: { allowOther: true } },
  { id: "experience", label: "Experience level", type: "RADIO", required: false, options: ["Beginner", "Intermediate", "Advanced"] },
  { id: "photo", label: "I'm happy to appear in event photos", type: "CHECKBOX", required: false },
  { id: "terms", label: "I agree to the code of conduct", type: "CHECKBOX", required: true },
];

/* ---------- Mapping ---------- */

type StoredField = { key: string; label: string; type: RegistrationFieldType; required: boolean; options: unknown; helpText?: string | null; placeholder?: string | null; settings?: unknown };

/** A stored question as the public form needs it: options as strings, settings parsed and type-checked. */
export function toFieldDefinition(field: StoredField) {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    options: Array.isArray(field.options) ? field.options.filter((value): value is string => typeof value === "string") : [],
    helpText: field.helpText ?? "",
    placeholder: field.placeholder ?? "",
    settings: settingsForType(field.type, parseFieldSettings(field.settings)),
  };
}
