import { RegistrationFieldType } from "@prisma/client";
import { DEFAULT_MAX_LENGTH, OTHER_MAX_LENGTH, parseFieldSettings, visibleFieldKeys } from "@/lib/registrationFields";
import {
  isValidInternationalPhone,
  normalizeInternationalPhone,
  phoneValidationMessage,
} from "@/lib/phone";

function optionsFromJson(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeEmailBasic(v: string) {
  return v.trim().toLowerCase();
}

function isBasicEmail(v: string) {
  // Simple sanity check; not RFC-perfect by design.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function coerceFiniteNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function coerceDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function validateAndNormalizeAnswers(params: {
  fields: Array<{
    id: string;
    key: string;
    label: string;
    type: RegistrationFieldType;
    required: boolean;
    options: unknown;
    /** FieldSettings JSON (lib/registrationFields.ts); invalid values are ignored. */
    settings?: unknown;
  }>;
  answers: Record<string, unknown>;
}): { rows: Array<{
  fieldId: string;
  valueText?: string | null;
  valueBool?: boolean | null;
  valueNumber?: number | null;
  valueDate?: Date | null;
}> } | { error: string } {
  const { fields, answers } = params;

  const rows: Array<{
    fieldId: string;
    valueText?: string | null;
    valueBool?: boolean | null;
    valueNumber?: number | null;
    valueDate?: Date | null;
  }> = [];

  const settingsByKey = new Map(fields.map((f) => [f.key, parseFieldSettings(f.settings)]));
  // Questions hidden by "show only if" are skipped entirely: never required, answers dropped.
  const visible = visibleFieldKeys(
    fields.map((f) => ({ key: f.key, type: f.type, settings: settingsByKey.get(f.key) })),
    answers,
  );

  for (const f of fields) {
    if (!visible.has(f.key)) continue;
    const settings = settingsByKey.get(f.key) ?? {};
    const raw = answers[f.key];
    const hasValue = raw !== undefined && raw !== null && raw !== "";

    switch (f.type) {
      case RegistrationFieldType.TEXT:
      case RegistrationFieldType.TEXTAREA: {
        const s = typeof raw === "string" ? raw.trim() : "";
        if (f.required && !s) return { error: `${f.label} is required.` };
        if (!s) break;
        const max = Math.min(settings.maxLength ?? DEFAULT_MAX_LENGTH[f.type]!, 5_000);
        if (s.length > max) return { error: `${f.label} must be at most ${max.toLocaleString("en-GB")} characters.` };
        if (settings.minLength != null && s.length < settings.minLength) return { error: `${f.label} must be at least ${settings.minLength} characters.` };
        rows.push({ fieldId: f.id, valueText: s });
        break;
      }
      case RegistrationFieldType.EMAIL: {
        const s = typeof raw === "string" ? normalizeEmailBasic(raw) : "";
        if (f.required && !s) return { error: `${f.label} is required.` };
        if (!s) break;
        if (!isBasicEmail(s)) return { error: `${f.label} must be a valid email.` };
        rows.push({ fieldId: f.id, valueText: s });
        break;
      }
      case RegistrationFieldType.PHONE: {
        const s = typeof raw === "string" ? normalizeInternationalPhone(raw) : "";
        if (f.required && !s) return { error: `${f.label} is required.` };
        if (!s) break;
        if (!isValidInternationalPhone(s)) {
          return { error: phoneValidationMessage(f.label, s) };
        }
        rows.push({ fieldId: f.id, valueText: s });
        break;
      }
      case RegistrationFieldType.SELECT:
      case RegistrationFieldType.RADIO: {
        const opts = optionsFromJson(f.options);
        const s = typeof raw === "string" ? raw.trim() : "";
        if (f.required && !s) return { error: `${f.label} is required.` };
        if (!s) break;
        if (opts.length > 0 && !opts.includes(s)) {
          if (!settings.allowOther) return { error: `${f.label} must be one of the available options.` };
          if (s.length > OTHER_MAX_LENGTH) return { error: `${f.label}: keep "Other" under ${OTHER_MAX_LENGTH} characters.` };
        }
        rows.push({ fieldId: f.id, valueText: s });
        break;
      }
      case RegistrationFieldType.MULTI_SELECT: {
        const opts = optionsFromJson(f.options);
        const arr =
          Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
        const picked = arr.map((s) => s.trim()).filter(Boolean);
        if (f.required && picked.length === 0) {
          return { error: `${f.label} is required.` };
        }
        const unique = [...new Set(picked)];
        if (settings.maxSelections != null && unique.length > settings.maxSelections) {
          return { error: `${f.label}: choose up to ${settings.maxSelections}.` };
        }
        const others = unique.filter((s) => opts.length > 0 && !opts.includes(s));
        if (others.length > 0 && (!settings.allowOther || others.length > 1)) {
          return { error: `${f.label} contains an invalid option.` };
        }
        if (others.some((s) => s.length > OTHER_MAX_LENGTH)) return { error: `${f.label}: keep "Other" under ${OTHER_MAX_LENGTH} characters.` };
        for (const s of unique) {
          rows.push({ fieldId: f.id, valueText: s });
        }
        break;
      }
      case RegistrationFieldType.CHECKBOX: {
        const b = typeof raw === "boolean" ? raw : raw === "on" ? true : false;
        if (f.required && !b) return { error: `${f.label} must be checked.` };
        if (hasValue) rows.push({ fieldId: f.id, valueBool: b });
        break;
      }
      case RegistrationFieldType.NUMBER: {
        if (!hasValue) {
          if (f.required) return { error: `${f.label} is required.` };
          break;
        }
        const n = coerceFiniteNumber(raw);
        if (n === null) return { error: `${f.label} must be a number.` };
        if (settings.min != null && n < settings.min) return { error: `${f.label} must be ${settings.min} or more.` };
        if (settings.max != null && n > settings.max) return { error: `${f.label} must be ${settings.max} or less.` };
        rows.push({ fieldId: f.id, valueNumber: n });
        break;
      }
      case RegistrationFieldType.DATE: {
        if (!hasValue) {
          if (f.required) return { error: `${f.label} is required.` };
          break;
        }
        const d = coerceDate(raw);
        if (!d) return { error: `${f.label} must be a valid date.` };
        const day = d.toISOString().slice(0, 10);
        if (settings.minDate && day < settings.minDate) return { error: `${f.label} can't be before ${settings.minDate}.` };
        if (settings.maxDate && day > settings.maxDate) return { error: `${f.label} can't be after ${settings.maxDate}.` };
        rows.push({ fieldId: f.id, valueDate: d });
        break;
      }
      default: {
        return { error: "Unsupported field type." };
      }
    }
  }

  return { rows };
}
