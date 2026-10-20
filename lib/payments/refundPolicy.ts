/**
 * An event's refund policy: pure and client-safe. Each order keeps a copy
 * taken when it was placed, so later changes never apply backwards.
 */
export type RefundPolicySnapshot = { kind: "NONE" | "FULL_UNTIL" | "PERCENT_UNTIL"; hours: number | null; percent: number | null; text: string; };

const HOUR_MS = 3_600_000;

export function asRefundPolicy(value: unknown): RefundPolicySnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const policy = value as Record<string, unknown>;
  if (policy.kind !== "NONE" && policy.kind !== "FULL_UNTIL" && policy.kind !== "PERCENT_UNTIL") return null;
  return {
    kind: policy.kind,
    hours: typeof policy.hours === "number" ? policy.hours : null,
    percent: typeof policy.percent === "number" ? policy.percent : null,
    text: typeof policy.text === "string" ? policy.text : "",
  };
}

/**
 * What the buyer gets back for cancelling now, or null when the policy
 * doesn't allow cancelling now. Percentages round down.
 */
export function policyRefundMinor(policy: RefundPolicySnapshot | null, refundableMinor: bigint, eventStart: Date, now = new Date()): bigint | null {
  if (!policy || policy.kind === "NONE" || policy.hours == null) return null;
  if (now.getTime() > eventStart.getTime() - policy.hours * HOUR_MS) return null;
  if (policy.kind === "FULL_UNTIL") return refundableMinor;
  return (refundableMinor * BigInt(policy.percent ?? 0)) / BigInt(100);
}

/**
 * Whether `next` refunds at least as much as `previous` at every moment:
 * once tickets are sold, a policy may only become more generous.
 */
export function isAtLeastAsGenerous(next: RefundPolicySnapshot, previous: RefundPolicySnapshot) {
  if (previous.kind === "NONE") return true;
  if (next.kind === "NONE") return false;
  // A later deadline means fewer hours before the start.
  if ((next.hours ?? 0) > (previous.hours ?? 0)) return false;
  if (next.kind === "FULL_UNTIL") return true;
  return previous.kind === "PERCENT_UNTIL" && (next.percent ?? 0) >= (previous.percent ?? 0);
}

function deadline(hours: number) {
  if (hours === 0) return "until the event starts";
  if (hours % 24 === 0) return `until ${hours / 24} ${hours === 24 ? "day" : "days"} before the event`;
  return `until ${hours} ${hours === 1 ? "hour" : "hours"} before the event`;
}

/** One line for buyers, e.g. "Full refund until 2 days before the event." */
export function describeRefundPolicy(policy: RefundPolicySnapshot | null) {
  if (!policy || policy.kind === "NONE" || policy.hours == null) return "No refunds on cancellation. Contact the organiser if something changes.";
  if (policy.kind === "FULL_UNTIL") return `Full refund if you cancel ${deadline(policy.hours)}.`;
  return `${policy.percent}% refund if you cancel ${deadline(policy.hours)}.`;
}
