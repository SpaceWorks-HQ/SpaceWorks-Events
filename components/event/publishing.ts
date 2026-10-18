/*
 * Plain-language helpers for the event Publishing section. Client-safe and
 * pure, so the wording and the closing-time maths are unit tested.
 */

export type CloseMode = "end" | "before" | "at";
export type LeadUnit = "minutes" | "hours" | "days";

export const LEAD_UNITS: Record<LeadUnit, { label: string; minutes: number }> = {
  minutes: { label: "minutes", minutes: 1 },
  hours: { label: "hours", minutes: 60 },
  days: { label: "days", minutes: 1440 },
};

/** 90 → 90 minutes, 120 → 2 hours, 2880 → 2 days: the largest unit that divides evenly. */
export function leadToParts(minutes: number): { amount: number; unit: LeadUnit } {
  if (minutes > 0 && minutes % 1440 === 0) return { amount: minutes / 1440, unit: "days" };
  if (minutes > 0 && minutes % 60 === 0) return { amount: minutes / 60, unit: "hours" };
  return { amount: minutes, unit: "minutes" };
}

/** "2 hours", "1 day", "45 minutes". */
export function formatLead(minutes: number): string {
  const { amount, unit } = leadToParts(minutes);
  const word = amount === 1 ? unit.slice(0, -1) : unit;
  return `${amount} ${word}`;
}

/** Wall-clock "YYYY-MM-DDTHH:mm" as a Date that holds those numbers in UTC, for maths and display only. */
function wallClock(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const date = new Date(`${value.slice(0, 16)}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatWallClock(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(date);
}

function zoneLabel(timeZone: string): string {
  return timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
}

/**
 * What the chosen closing rule means for guests. `problem` is set when the
 * server would reject the rule, so the form can say so before saving.
 */
export function closingSummary(input: {
  mode: CloseMode;
  start: string;
  leadMinutes: number | null;
  closesAt: string;
  timeZone: string;
}): { short: string; long: string; problem?: string } {
  const start = wallClock(input.start);
  const zone = zoneLabel(input.timeZone);
  if (input.mode === "end") {
    return { short: "open until it ends", long: "Sign-ups stay open until the event ends." };
  }
  if (input.mode === "before") {
    if (input.leadMinutes == null) return { short: "", long: "", problem: "Enter how long before the start sign-ups close." };
    const when = start ? new Date(start.getTime() - input.leadMinutes * 60_000) : null;
    const lead = input.leadMinutes === 0 ? "when it starts" : `${formatLead(input.leadMinutes)} before the start`;
    return {
      short: input.leadMinutes === 0 ? "closes when it starts" : `closes ${formatLead(input.leadMinutes)} before`,
      long: when ? `Sign-ups close ${lead}: ${formatWallClock(when)} (${zone} time). Moves with the start time.` : `Sign-ups close ${lead}.`,
    };
  }
  const at = wallClock(input.closesAt);
  if (!at) return { short: "", long: "", problem: "Choose the date and time sign-ups close." };
  if (start && at > start) return { short: "", long: "", problem: "Sign-ups must close on or before the start time." };
  return { short: `closes ${formatWallClock(at)}`, long: `Sign-ups close ${formatWallClock(at)} (${zone} time).` };
}

/* ---------- Audience: who can find it × whether you approve sign-ups ---------- */

export type Reach = "listed" | "link" | "invite";
export type Audience = { reach: Reach; approve: boolean };
type Privacy = "PUBLIC" | "HIDDEN_LINK" | "APPROVAL_REQUIRED" | "INVITE_ONLY";

/** The stored privacy mode as the two plain choices the form shows. */
export function audienceFromPrivacy(privacyType: string, listedPublicly: boolean): Audience {
  if (privacyType === "INVITE_ONLY") return { reach: "invite", approve: false };
  if (privacyType === "APPROVAL_REQUIRED") return { reach: listedPublicly ? "listed" : "link", approve: true };
  return { reach: privacyType === "PUBLIC" ? "listed" : "link", approve: false };
}

/** The two choices back to what's stored. Listing only applies to approval events. */
export function privacyFromAudience({ reach, approve }: Audience): { privacyType: Privacy; listedPublicly: boolean } {
  if (reach === "invite") return { privacyType: "INVITE_ONLY", listedPublicly: false };
  if (approve) return { privacyType: "APPROVAL_REQUIRED", listedPublicly: reach === "listed" };
  return { privacyType: reach === "listed" ? "PUBLIC" : "HIDDEN_LINK", listedPublicly: false };
}

function audienceLine(privacyType: string, listedPublicly: boolean): string {
  const { reach, approve } = audienceFromPrivacy(privacyType, listedPublicly);
  if (reach === "invite") return "Only invited people can sign up";
  const where = reach === "listed" ? "Listed publicly" : "Link only";
  return `${where}, ${approve ? "you approve each sign-up" : "anyone can sign up"}`;
}

/** One line for the top of the section: "Live. Listed publicly, anyone can sign up · 120 spots · closes 2 hours before." */
export function publishingSummary(input: { status: string; privacyType: string; listedPublicly?: boolean; capacity: number | null; closing: string }): { headline: string; detail: string } {
  if (input.status === "DRAFT") return { headline: "Draft.", detail: "Only your team can see this event. Make it live when you're ready." };
  if (input.status === "HIDDEN") return { headline: "Offline.", detail: "The event page is taken down and sign-ups are closed." };
  if (input.status === "CANCELLED") return { headline: "Cancelled.", detail: "Guests can't sign up." };
  const parts = [audienceLine(input.privacyType, input.listedPublicly ?? false), input.capacity ? `${input.capacity} spots` : "unlimited spots", input.closing].filter(Boolean);
  return { headline: "Live.", detail: `${parts.join(" · ")}.` };
}
