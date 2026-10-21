import { fieldTypeMeta, settingsForType } from "@/lib/registrationFields";
import type { BuilderField } from "../builderModel";

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
