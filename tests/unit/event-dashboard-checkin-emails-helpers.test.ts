import { describe, expect, it } from "vitest";
import { doorsStatus, seatDots } from "@/components/event-dashboard/check-in/doors";
import { recipientDots, recipientSummary, sendBarLabel } from "@/components/event-dashboard/emails/recipients";

const start = new Date("2026-10-15T13:00:00.000Z");
const end = new Date("2026-10-15T17:00:00.000Z");
const at = (offsetMs: number) => new Date(start.getTime() + offsetMs);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("doorsStatus", () => {
  const base = { start, end, timezone: "Asia/Kolkata" };

  it("counts down in minutes, hours, then days", () => {
    expect(doorsStatus({ ...base, now: at(-30 * 1000) })).toEqual({ label: "Doors open in 1 minute", tone: "upcoming" });
    expect(doorsStatus({ ...base, now: at(-45 * MIN) }).label).toBe("Doors open in 45 minutes");
    expect(doorsStatus({ ...base, now: at(-HOUR) }).label).toBe("Doors open in 1 hour");
    expect(doorsStatus({ ...base, now: at(-22 * HOUR - 10 * MIN) }).label).toBe("Doors open in 22 hours");
    expect(doorsStatus({ ...base, now: at(-3 * DAY) }).label).toBe("Doors open in 3 days");
  });

  it("names the day in the event timezone when far off", () => {
    expect(doorsStatus({ ...base, now: at(-30 * DAY) }).label).toBe("Doors open Thu 15 Oct · 6:30 PM");
  });

  it("is live between start and end, ended afterwards", () => {
    expect(doorsStatus({ ...base, now: start })).toEqual({ label: "Happening now", tone: "live" });
    expect(doorsStatus({ ...base, now: at(2 * HOUR) }).tone).toBe("live");
    expect(doorsStatus({ ...base, now: end })).toEqual({ label: "Ended", tone: "ended" });
  });

  it("reports a cancelled event regardless of time", () => {
    expect(doorsStatus({ ...base, now: at(-HOUR), cancelled: true })).toEqual({ label: "Event cancelled", tone: "cancelled" });
  });
});

describe("seatDots", () => {
  it("uses one dot per confirmed guest up to the cap", () => {
    expect(seatDots(0, 34)).toEqual({ seats: 34, lit: 0 });
    expect(seatDots(10, 34)).toEqual({ seats: 34, lit: 10 });
    expect(seatDots(500, 1000)).toEqual({ seats: 96, lit: 48 });
  });

  it("keeps one dot lit for any arrival and never exceeds the seats", () => {
    expect(seatDots(1, 1000)).toEqual({ seats: 96, lit: 1 });
    expect(seatDots(40, 34)).toEqual({ seats: 34, lit: 34 });
  });

  it("shows a single empty seat when nobody is confirmed", () => {
    expect(seatDots(3, 0)).toEqual({ seats: 1, lit: 0 });
  });
});

describe("recipient helpers", () => {
  it("summarises the count", () => {
    expect(recipientSummary(null)).toEqual({ count: "", rest: "Counting recipients…" });
    expect(recipientSummary(0).count).toBe("No one");
    expect(recipientSummary(1)).toEqual({ count: "1 person", rest: "will get this. One email per address." });
    expect(recipientSummary(34).count).toBe("34 people");
  });

  it("explains why the send bar cannot send yet", () => {
    expect(sendBarLabel({ count: 5, hasStatuses: false, hasContent: true })).toBe("Pick at least one group to send to");
    expect(sendBarLabel({ count: 5, hasStatuses: true, hasContent: false })).toBe("Add a subject and a message to send");
    expect(sendBarLabel({ count: null, hasStatuses: true, hasContent: true })).toBe("Counting recipients…");
    expect(sendBarLabel({ count: 0, hasStatuses: true, hasContent: true })).toBe("No one matches this audience yet");
    expect(sendBarLabel({ count: 34, hasStatuses: true, hasContent: true })).toBe("Ready to send to 34 people");
  });

  it("scales the reach dots", () => {
    expect(recipientDots(34, 40)).toEqual({ dots: 40, lit: 34 });
    expect(recipientDots(0, 0)).toEqual({ dots: 1, lit: 0 });
    expect(recipientDots(1, 400)).toEqual({ dots: 40, lit: 1 });
    expect(recipientDots(200, 400)).toEqual({ dots: 40, lit: 20 });
  });
});
