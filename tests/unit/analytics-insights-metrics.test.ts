import { describe, expect, it } from "vitest";
import { arrivalWindows, clickSeries, localDateKey, returningShare } from "@/components/event-dashboard/analytics/metrics";

describe("analytics insights metrics", () => {
  it("dates a visit by the event's own calendar day", () => {
    const lateEvening = new Date("2026-10-20T20:30:00Z");
    expect(localDateKey(lateEvening, "UTC")).toBe("2026-10-20");
    // 02:00 the next morning in Kochi.
    expect(localDateKey(lateEvening, "Asia/Kolkata")).toBe("2026-10-21");
  });

  it("charts short-link visits for the last 14 days, with the all-time total", () => {
    expect(clickSeries([], "2026-10-20")).toBeNull();
    expect(clickSeries([{ day: "2026-10-01", count: 0 }], "2026-10-20")).toBeNull();
    const series = clickSeries(
      [
        { day: "2026-09-01", count: 5 },
        { day: "2026-10-10", count: 3 },
        { day: "2026-10-18", count: 4 },
        { day: "2026-10-20", count: 2 },
      ],
      "2026-10-20",
    )!;
    expect(series.columns).toHaveLength(14);
    expect(series.columns.at(-1)).toEqual({ label: "20 Oct", count: 2 });
    expect(series.columns[0]!.label).toBe("7 Oct");
    expect(series.total).toBe(14);
    expect(series.lastWeek).toBe(6);
    expect(series.largest).toBe(4);
  });

  it("reports returning attendees only as an aggregate, and only for 10 or more people", () => {
    const people = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${index}`);
    expect(returningShare([people("a", 4), people("a", 3)])).toBeNull();
    // 12 people over two events; a0..a2 came to both.
    const share = returningShare([people("a", 8), [...people("a", 3), ...people("b", 4)]])!;
    expect(share).toEqual({ people: 12, returning: 3, percent: 25 });
    // Someone registered twice for one event is still one person there.
    expect(returningShare([[...people("c", 10), "c0"]])).toEqual({ people: 10, returning: 0, percent: 0 });
  });

  it("groups arrivals into windows sized to the door's busy period", () => {
    const start = Date.parse("2026-10-16T12:30:00Z");
    const times = [0, 5, 7, 20, 33, 61].map((minutes) => new Date(start + minutes * 60_000));
    const arrivals = arrivalWindows(times, "Asia/Kolkata")!;
    expect(arrivals.minutes).toBe(15);
    expect(arrivals.columns.reduce((sum, column) => sum + column.count, 0)).toBe(6);
    expect(arrivals.peak.count).toBe(3);
    expect(arrivals.first.toISOString()).toBe("2026-10-16T12:30:00.000Z");
    expect(arrivalWindows([], "UTC")).toBeNull();
  });
});
