import { formatDayShort, formatTime } from "@/lib/format/datetime";

/* Pure helpers for the Check-in tab. No I/O; safe on server and client. */

export type DoorsTone = "upcoming" | "live" | "ended" | "cancelled";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

/**
 * The chip above the check-in desk: a countdown to the event start, "Happening
 * now" while it runs, "Ended" afterwards. Far-off dates use the event's own
 * timezone so the day matches what attendees see.
 */
export function doorsStatus(input: { start: Date | string; end: Date | string; timezone: string; now: Date | string; cancelled?: boolean }): { label: string; tone: DoorsTone } {
  if (input.cancelled) return { label: "Event cancelled", tone: "cancelled" };
  const start = new Date(input.start).getTime();
  const end = new Date(input.end).getTime();
  const now = new Date(input.now).getTime();
  if (now >= end) return { label: "Ended", tone: "ended" };
  if (now >= start) return { label: "Happening now", tone: "live" };

  const diff = start - now;
  if (diff < HOUR) return { label: `Doors open in ${plural(Math.max(1, Math.ceil(diff / MINUTE)), "minute")}`, tone: "upcoming" };
  if (diff < 2 * DAY) return { label: `Doors open in ${plural(Math.floor(diff / HOUR), "hour")}`, tone: "upcoming" };
  if (diff < 14 * DAY) return { label: `Doors open in ${plural(Math.floor(diff / DAY), "day")}`, tone: "upcoming" };
  return { label: `Doors open ${formatDayShort(input.start, input.timezone, input.now)} · ${formatTime(input.start, input.timezone)}`, tone: "upcoming" };
}

/** Seat dots for "X of Y checked in": one dot per confirmed guest, scaled down past `cap`. */
export function seatDots(checkedIn: number, confirmed: number, cap = 96): { seats: number; lit: number } {
  const total = Math.max(0, Math.floor(confirmed));
  const arrived = Math.max(0, Math.floor(checkedIn));
  const seats = Math.min(Math.max(total, 1), cap);
  if (total === 0) return { seats, lit: 0 };
  const ratio = Math.min(arrived, total) / total;
  const lit = Math.round(ratio * seats);
  return { seats, lit: arrived > 0 ? Math.max(1, lit) : 0 };
}
