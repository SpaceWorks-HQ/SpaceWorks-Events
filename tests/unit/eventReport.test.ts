import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculateReportRsvpMetrics, countCheckInSources, createEventReportPdf, isReportAvailable, reportFilename, summariseQuestions, type EventReportMetrics } from "@/lib/eventReport";
import { arrivalWindows } from "@/lib/eventReportPdf";

describe("event reports", () => {
  it("calculates RSVP funnel and attendance metrics without capacity assumptions", () => {
    const metrics = calculateReportRsvpMetrics([
      { status: "CONFIRMED", checkedInAt: new Date("2030-01-01T10:00:00Z") },
      { status: "CONFIRMED", checkedInAt: null },
      { status: "WAITLISTED", checkedInAt: null },
      { status: "PENDING_APPROVAL", checkedInAt: null },
      { status: "REJECTED", checkedInAt: null },
    ]);

    expect(metrics).toEqual({ total: 5, confirmed: 2, waitlisted: 1, pendingApproval: 1, rejected: 1, checkedIn: 1, noShows: 1 });
  });

  it("requires the end time to have passed", () => {
    const now = new Date("2030-01-01T12:00:00Z");
    expect(isReportAvailable(new Date("2030-01-01T11:59:59Z"), now)).toBe(true);
    expect(isReportAvailable(new Date("2030-01-01T12:00:00Z"), now)).toBe(false);
  });

  it("generates a non-empty PDF with a safe attachment filename", async () => {
    const report: EventReportMetrics = {
      targetType: "event",
      targetId: "event-1",
      organisationId: "org-1",
      organisationName: "Yuyu Events",
      title: "Community Meetup",
      startDateTime: new Date("2030-01-01T10:00:00Z"),
      endDateTime: new Date("2030-01-01T12:00:00Z"),
      timeZone: "UTC",
      location: "Main hall",
      isOnline: false,
      capacity: 40,
      invitationCount: 6,
      feedbackResponseCount: 3,
      total: 24,
      confirmed: 20,
      waitlisted: 2,
      pendingApproval: 1,
      rejected: 1,
      checkedIn: 16,
      noShows: 4,
    };

    const pdf = await createEventReportPdf(report);
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(reportFilename(report)).toBe("community-meetup-event-report-2030-01-01.pdf");
  });

  it("reduces form answers to counts and never copies typed answers", () => {
    const summary = summariseQuestions(
      [
        { id: "diet", label: "Dietary needs", type: "MULTI_SELECT", options: ["Vegetarian", "Vegan"] },
        { id: "photos", label: "Happy to be photographed", type: "CHECKBOX", options: null },
        { id: "phone", label: "Phone", type: "PHONE", options: null },
      ],
      [
        { fieldId: "diet", respondentId: "a", valueText: "Vegetarian", valueBool: null },
        { fieldId: "diet", respondentId: "a", valueText: "Vegan", valueBool: null },
        { fieldId: "diet", respondentId: "b", valueText: "Only mangoes", valueBool: null },
        { fieldId: "photos", respondentId: "a", valueText: null, valueBool: true },
        { fieldId: "photos", respondentId: "b", valueText: null, valueBool: false },
        { fieldId: "phone", respondentId: "a", valueText: "+919999999999", valueBool: null },
      ],
    );

    expect(summary[0]).toEqual({ label: "Dietary needs", type: "MULTI_SELECT", answered: 2, choices: [{ label: "Vegetarian", count: 1 }, { label: "Vegan", count: 1 }, { label: "Other", count: 1 }] });
    expect(summary[1]!.choices).toEqual([{ label: "Yes", count: 1 }, { label: "No", count: 1 }]);
    expect(summary[2]).toEqual({ label: "Phone", type: "PHONE", answered: 1, choices: null });
    expect(JSON.stringify(summary)).not.toContain("mangoes");
    expect(JSON.stringify(summary)).not.toContain("+91");
  });

  it("counts check-ins by device", () => {
    expect(countCheckInSources(["online", "venue-station", "offline-sync", null, "venue-station"])).toEqual({ organiser: 2, offline: 1, station: 2 });
  });

  it("groups arrivals into readable windows", () => {
    const start = Date.parse("2030-01-01T09:00:00Z");
    const times = [0, 5, 14, 20, 50].map((minutes) => new Date(start + minutes * 60_000));
    const windows = arrivalWindows(times, "UTC")!;

    expect(windows.minutes).toBe(15);
    expect(windows.columns.map((column) => column.count)).toEqual([3, 1, 0, 1]);
    expect(windows.peak).toEqual({ label: "9:00 AM – 9:15 AM", count: 3 });
    expect(arrivalWindows([], "UTC")).toBeNull();
  });

  it("builds a full report with the brand fonts", async () => {
    const start = new Date("2030-01-01T10:00:00Z");
    const report: EventReportMetrics = {
      targetType: "event",
      targetId: "event-1",
      organisationId: "org-1",
      organisationName: "Kerala Makers",
      title: "Maker Conference – Trivandrum",
      startDateTime: start,
      endDateTime: new Date("2030-01-01T16:00:00Z"),
      timeZone: "Asia/Kolkata",
      location: "Technopark",
      isOnline: false,
      capacity: 100,
      invitationCount: 0,
      feedbackResponseCount: 2,
      accentColor: "#0F766E",
      signupDates: [new Date("2029-12-20T10:00:00Z"), new Date("2029-12-28T10:00:00Z")],
      checkInTimes: [new Date("2030-01-01T09:50:00Z")],
      checkInSources: { organiser: 1, offline: 0, station: 0 },
      registrationQuestions: [{ label: "T-shirt size", type: "SELECT", answered: 2, choices: [{ label: "M", count: 2 }] }],
      feedbackQuestions: [{ label: "Comments", type: "TEXTAREA", answered: 2, choices: null }],
      sessions: [{ title: "Keynote", type: "Keynote", track: "Main hall", start, end: new Date("2030-01-01T11:00:00Z"), delayMinutes: 5, speakers: ["Adithya Rao"] }],
      speakers: [{ name: "Adithya Rao", detail: "Founder" }],
      sponsors: [{ name: "Technopark", tier: "PARTNER" }],
      broadcasts: [{ subject: "See you tomorrow", sentAt: new Date("2029-12-31T10:00:00Z"), recipientCount: 2 }],
      total: 2,
      confirmed: 2,
      waitlisted: 0,
      pendingApproval: 0,
      rejected: 0,
      checkedIn: 1,
      noShows: 1,
    };

    const document = await PDFDocument.load(await createEventReportPdf(report));
    expect(document.getPageCount()).toBeGreaterThan(2);
    expect(document.getTitle()).toBe("Maker Conference – Trivandrum – event report");
  });
});
