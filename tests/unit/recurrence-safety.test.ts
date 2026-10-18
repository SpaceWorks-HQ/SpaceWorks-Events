import { describe, expect, it } from "vitest";
import { buildRecurrenceIcs, materializeInstances } from "@/lib/recurrence";
import { createSeriesSchema } from "@/lib/validators";

describe("recurrence safety", () => {
  it("bounds dense infinite rules while preserving chronological windows", () => {
    const start = new Date("2030-01-01T00:00:00.000Z");
    const windows = materializeInstances(buildRecurrenceIcs(start, "FREQ=SECONDLY"), 1_000, {
      from: start,
      until: new Date("2031-01-01T00:00:00.000Z"),
    });
    expect(windows).toHaveLength(48);
    expect(windows[0]?.startDateTime).toEqual(start);
    expect(windows[47]?.startDateTime).toEqual(new Date("2030-01-01T00:00:47.000Z"));
  });

  it("keeps the local time across daylight-saving changes in the series timezone", () => {
    // 18:00 in New York: EDT (UTC-4) until 1 November 2026, then EST (UTC-5).
    const start = new Date("2026-10-27T22:00:00.000Z");
    const windows = materializeInstances(buildRecurrenceIcs(start, "FREQ=WEEKLY;COUNT=3"), 3_600_000, {
      from: start,
      timeZone: "America/New_York",
    });
    expect(windows.map((window) => window.startDateTime.toISOString())).toEqual([
      "2026-10-27T22:00:00.000Z",
      "2026-11-03T23:00:00.000Z",
      "2026-11-10T23:00:00.000Z",
    ]);
  });

  it("matches BYDAY against the local day in the series timezone", () => {
    // Monday 02:00 in Kolkata is Sunday 20:30 UTC.
    const start = new Date("2030-01-06T20:30:00.000Z");
    const windows = materializeInstances(buildRecurrenceIcs(start, "FREQ=WEEKLY;BYDAY=MO;COUNT=2"), 3_600_000, {
      from: start,
      timeZone: "Asia/Kolkata",
    });
    expect(windows.map((window) => window.startDateTime.toISOString())).toEqual([
      "2030-01-06T20:30:00.000Z",
      "2030-01-13T20:30:00.000Z",
    ]);
  });

  it("applies UNTIL as a real instant in a non-UTC series", () => {
    // 10:00 daily in Kolkata (04:30 UTC); UNTIL is the third start exactly.
    const start = new Date("2030-01-01T04:30:00.000Z");
    const windows = materializeInstances(buildRecurrenceIcs(start, "FREQ=DAILY;UNTIL=20300103T043000Z"), 3_600_000, {
      from: start,
      timeZone: "Asia/Kolkata",
    });
    expect(windows.map((window) => window.startDateTime.toISOString())).toEqual([
      "2030-01-01T04:30:00.000Z",
      "2030-01-02T04:30:00.000Z",
      "2030-01-03T04:30:00.000Z",
    ]);
  });

  it("keeps seconds when a timezone is supplied", () => {
    const start = new Date("2030-01-01T00:00:00.000Z");
    const windows = materializeInstances(buildRecurrenceIcs(start, "FREQ=SECONDLY;COUNT=3"), 1_000, {
      from: start,
      timeZone: "UTC",
    });
    expect(windows.map((window) => window.startDateTime.toISOString())).toEqual([
      "2030-01-01T00:00:00.000Z",
      "2030-01-01T00:00:01.000Z",
      "2030-01-01T00:00:02.000Z",
    ]);
  });

  it("skips local times that a daylight-saving change removes", () => {
    // 02:30 New York does not exist on 8 March 2026 (clocks jump 02:00 → 03:00).
    const start = new Date("2026-03-07T07:30:00.000Z");
    const windows = materializeInstances(buildRecurrenceIcs(start, "FREQ=DAILY;COUNT=3"), 3_600_000, {
      from: start,
      timeZone: "America/New_York",
    });
    expect(windows.map((window) => window.startDateTime.toISOString())).toEqual([
      "2026-03-07T07:30:00.000Z",
      "2026-03-09T06:30:00.000Z",
    ]);
  });

  it("clamps caller-provided expansion limits", () => {
    const start = new Date("2030-01-01T00:00:00.000Z");
    const windows = materializeInstances(buildRecurrenceIcs(start, "FREQ=SECONDLY"), 1_000, {
      maxInstances: 10_000,
      from: start,
      until: new Date("2031-01-01T00:00:00.000Z"),
    });
    expect(windows).toHaveLength(500);
  });

  it("rejects multiline rule injection and durations Prisma Int cannot store", () => {
    const base = {
      organisationSlug: "org",
      title: "Series",
      description: "",
      anchorStartDateTime: new Date("2030-01-01T00:00:00.000Z"),
      anchorEndDateTime: new Date("2030-01-01T01:00:00.000Z"),
      rruleLine: "FREQ=DAILY",
      timezone: "UTC",
      status: "DRAFT",
      privacyType: "PUBLIC",
    };
    expect(createSeriesSchema.safeParse({ ...base, rruleLine: "FREQ=DAILY\nRDATE:20300102T000000Z" }).success).toBe(false);
    expect(createSeriesSchema.safeParse({ ...base, anchorEndDateTime: new Date("2030-02-01T00:00:00.000Z") }).success).toBe(false);
  });
});
