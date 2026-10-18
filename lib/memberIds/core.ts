/*
 * Member ID rules shared by the server, the dashboard and tests: ID numbers,
 * expiry, card status and custom field answers. Pure functions only.
 */

export type MemberStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
export type FieldType = "TEXT" | "SELECT" | "DATE" | "EMAIL" | "PHONE";
export type FieldPlacement = "FRONT" | "BACK" | "HIDDEN";

export const ID_PREFIX_PATTERN = /^[A-Z0-9]{2,6}$/;
export const MAX_PROGRAMME_FIELDS = 12;
export const MAX_FIELD_OPTIONS = 20;
export const FIELD_VALUE_MAX = 200;
export const MEMBER_NAME_MAX = 120;

/**
 * A short prefix for printed ID numbers from the organisation name: the first
 * three letters of a one-word name, or the initials of the first three words.
 */
export function deriveIdPrefix(name: string) {
  const words = name.normalize("NFKD").replace(/[^A-Za-z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  const prefix = words.length === 1 ? words[0]!.slice(0, 3) : words.slice(0, 3).map((word) => word[0]).join("");
  const clean = prefix.toUpperCase();
  return ID_PREFIX_PATTERN.test(clean) ? clean : "ID";
}

/** `SWK-2026-0042`: prefix, issue year, and a per-programme sequence padded to four digits. */
export function formatIdNumber(prefix: string, year: number, sequence: number) {
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

/** When a card issued at `issuedAt` expires under the programme's rule, or null for no expiry. */
export function computeExpiry(programme: { validUntil: Date | null; validityDays: number | null }, issuedAt: Date) {
  if (programme.validUntil) return programme.validUntil;
  if (programme.validityDays && programme.validityDays > 0) return new Date(issuedAt.getTime() + programme.validityDays * 86_400_000);
  return null;
}

export type CardState = "valid" | "expired" | "revoked" | "pending" | "rejected";

/** What a card is right now. Only approved, unexpired cards are valid. */
export function cardState(member: { status: MemberStatus; expiresAt: Date | null }, now = new Date()): CardState {
  if (member.status === "REVOKED") return "revoked";
  if (member.status === "REJECTED") return "rejected";
  if (member.status === "PENDING") return "pending";
  if (member.expiresAt && member.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

/** Status words for pills; every status pairs a colour with a word. */
export const CARD_STATE_LABELS: Record<CardState, string> = {
  valid: "Valid",
  expired: "Expired",
  revoked: "Revoked",
  pending: "Waiting for approval",
  rejected: "Not approved",
};

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  PENDING: "Waiting",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REVOKED: "Revoked",
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "31 Dec 2026". Card dates are calendar dates, shown in UTC for every viewer. */
export function formatCardDate(value: Date | null | undefined) {
  return value ? dateFormatter.format(value) : null;
}

/** Date-only input (YYYY-MM-DD) as the end of that day in UTC, or null when invalid. */
export function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59));
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(match[3]) ? null : date;
}

export function toDateInput(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

/** A field key from its label: lower-case letters, digits and underscores, unique within the form. */
export function fieldKeyFor(label: string, taken: ReadonlySet<string>) {
  const base = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";
  let key = base;
  for (let n = 2; taken.has(key) || ["name", "email", "photo"].includes(key); n += 1) key = `${base}_${n}`;
  return key;
}

export type ProgrammeFieldDef = { key: string; label: string; type: FieldType; required: boolean; options: string[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{6,24}$/;

/**
 * Check answers against the form. Returns cleaned values (only known keys,
 * trimmed, bounded) or the first problem in words.
 */
export function validateFieldValues(fields: ProgrammeFieldDef[], input: Record<string, unknown>, options: { enforceRequired?: boolean } = {}) {
  const enforceRequired = options.enforceRequired ?? true;
  const values: Record<string, string> = {};
  for (const field of fields) {
    const raw = input[field.key];
    const value = typeof raw === "string" ? raw.trim().slice(0, FIELD_VALUE_MAX) : "";
    if (!value) {
      if (field.required && enforceRequired) return { ok: false as const, error: `${field.label} is required.` };
      continue;
    }
    if (field.type === "EMAIL" && !EMAIL.test(value)) return { ok: false as const, error: `${field.label} needs a valid email address.` };
    if (field.type === "PHONE" && !PHONE.test(value)) return { ok: false as const, error: `${field.label} needs a valid phone number.` };
    if (field.type === "DATE" && !parseDateInput(value)) return { ok: false as const, error: `${field.label} needs a date (YYYY-MM-DD).` };
    if (field.type === "SELECT" && !field.options.includes(value)) return { ok: false as const, error: `Choose one of the options for ${field.label}.` };
    values[field.key] = value;
  }
  return { ok: true as const, values };
}

export function isEmail(value: string) {
  return value.length <= 320 && EMAIL.test(value);
}

/** Answers as printable details, in form order, skipping empty ones. */
export function memberDetails(fields: Array<Pick<ProgrammeFieldDef, "key" | "label" | "type">>, values: unknown) {
  const record = values && typeof values === "object" && !Array.isArray(values) ? (values as Record<string, unknown>) : {};
  return fields.flatMap((field) => {
    const value = record[field.key];
    if (typeof value !== "string" || !value.trim()) return [];
    const shown = field.type === "DATE" ? formatCardDate(parseDateInput(value)) ?? value : value;
    return [{ key: field.key, label: field.label, value: shown }];
  });
}
