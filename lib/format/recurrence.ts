/**
 * Attendee-facing description of a recurrence rule (docs/DESIGN.md §4.5:
 * "Every Tuesday" / "Weekly"; never show raw RRULE strings).
 */

const WEEKDAYS: Record<string, string> = { MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday", FR: "Friday", SA: "Saturday", SU: "Sunday" };
const ORDINALS: Record<string, string> = { "1": "first", "2": "second", "3": "third", "4": "fourth", "-1": "last" };

function parseRule(rule: string) {
  const line = rule.split(/\r?\n/).find((part) => /FREQ=/i.test(part)) ?? rule;
  const body = line.replace(/^RRULE:/i, "");
  const fields: Record<string, string> = {};
  for (const pair of body.split(";")) {
    const [key, value] = pair.split("=");
    if (key && value) fields[key.trim().toUpperCase()] = value.trim().toUpperCase();
  }
  return fields;
}

function joinDays(days: string[]) {
  if (days.length <= 1) return days[0] ?? "";
  return `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
}

/** Short chip label: "Weekly", "Daily", "Monthly", "Yearly", or "Repeats". */
export function recurrenceChip(rule: string | null | undefined): string {
  const fields = parseRule(rule ?? "");
  const interval = Number(fields.INTERVAL ?? "1");
  switch (fields.FREQ) {
    case "DAILY":
      return interval > 1 ? `Every ${interval} days` : "Daily";
    case "WEEKLY":
      return interval === 2 ? "Fortnightly" : interval > 1 ? `Every ${interval} weeks` : "Weekly";
    case "MONTHLY":
      return interval > 1 ? `Every ${interval} months` : "Monthly";
    case "YEARLY":
      return "Yearly";
    default:
      return "Repeats";
  }
}

/** Sentence-case phrase: "Every Tuesday", "Every second Thursday of the month", "Every 2 weeks". */
export function describeRecurrence(rule: string | null | undefined): string {
  const fields = parseRule(rule ?? "");
  const interval = Number(fields.INTERVAL ?? "1");
  const byDay = (fields.BYDAY ?? "").split(",").filter(Boolean);
  if (fields.FREQ === "WEEKLY") {
    const days = byDay.map((code) => WEEKDAYS[code.replace(/^[+-]?\d+/, "")]).filter((day): day is string => Boolean(day));
    if (interval === 1 && days.length > 0) return `Every ${joinDays(days)}`;
    if (interval > 1 && days.length > 0) return `Every ${interval} weeks on ${joinDays(days)}`;
  }
  if (fields.FREQ === "MONTHLY" && byDay.length === 1) {
    const match = /^([+-]?\d+)?([A-Z]{2})$/.exec(byDay[0]!);
    const ordinal = match?.[1] ? ORDINALS[String(Number(match[1]))] : undefined;
    const day = match ? WEEKDAYS[match[2]!] : undefined;
    if (ordinal && day && interval === 1) return `Every ${ordinal} ${day} of the month`;
  }
  const chip = recurrenceChip(rule);
  return chip === "Repeats" ? "Repeats regularly" : chip;
}
