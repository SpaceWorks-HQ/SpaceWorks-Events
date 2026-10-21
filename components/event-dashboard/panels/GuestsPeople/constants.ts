import type { GuestStatusFilter } from "@/components/event-dashboard/guests/guestList";

export const PAGE_SIZE = 25;

export const FILTER_DOTS: Record<GuestStatusFilter, string> = {
  all: "bg-ink",
  going: "bg-success-solid",
  waitlist: "bg-warning-solid",
  approve: "bg-highlight",
  declined: "bg-danger-fg",
  checkedIn: "bg-primary",
};

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Whose registrations the list shows. A one-off event gets the full toolset;
 * a series date (RSVPs keyed by `eventInstanceId`) only gets the actions that
 * accept an instance id, so manual add, the CSV/email exports and undo
 * check-in are hidden there.
 */
export type GuestListTarget =
  | { kind: "event"; eventId: string; eventTitle: string }
  | { kind: "instance"; instanceId: string; seriesId: string };
