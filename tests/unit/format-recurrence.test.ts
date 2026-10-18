import { describe, expect, it } from "vitest";
import { describeRecurrence, recurrenceChip } from "@/lib/format/recurrence";

describe("recurrence descriptions", () => {
  it("names weekly days in plain language", () => {
    expect(describeRecurrence("FREQ=WEEKLY;BYDAY=TU")).toBe("Every Tuesday");
    expect(describeRecurrence("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR")).toBe("Every Monday, Wednesday and Friday");
    expect(describeRecurrence("FREQ=WEEKLY;INTERVAL=2;BYDAY=TH")).toBe("Every 2 weeks on Thursday");
  });

  it("handles monthly ordinals and plain frequencies", () => {
    expect(describeRecurrence("FREQ=MONTHLY;BYDAY=2TH")).toBe("Every second Thursday of the month");
    expect(describeRecurrence("FREQ=MONTHLY;BYDAY=-1FR")).toBe("Every last Friday of the month");
    expect(describeRecurrence("FREQ=DAILY")).toBe("Daily");
    expect(describeRecurrence("DTSTART:20300101T100000Z\nRRULE:FREQ=MONTHLY")).toBe("Monthly");
  });

  it("never echoes raw rule text", () => {
    expect(describeRecurrence("garbage")).toBe("Repeats regularly");
    expect(describeRecurrence(null)).toBe("Repeats regularly");
    expect(recurrenceChip("FREQ=WEEKLY")).toBe("Weekly");
    expect(recurrenceChip("FREQ=WEEKLY;INTERVAL=2")).toBe("Fortnightly");
  });
});
