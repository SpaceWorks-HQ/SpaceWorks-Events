import { randomUUID } from "node:crypto";
import { EventPrivacyType, EventStatus, RsvpStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { prisma } from "@/lib/db";
import { getEventReportMetrics } from "@/lib/eventReport";
import { recordShortLinkVisit } from "@/lib/shortLinkResolve";

const suffix = randomUUID().replace(/-/g, "");
let organisationId: string;
let eventId: string;

function rsvp(email: string, status: RsvpStatus) {
  return prisma.rSVP.create({ data: { eventId, guestEmail: email, guestName: email, attendeeKey: `guest:${email}`, status } });
}

beforeAll(async () => {
  const organisation = await prisma.organisation.create({ data: { name: "Analytics org", slug: `analytics-${suffix}` } });
  organisationId = organisation.id;
  const event = await prisma.event.create({
    data: {
      organisationId,
      title: "Analytics night",
      slug: `analytics-night-${suffix}`,
      startDateTime: new Date("2026-01-01T12:00:00.000Z"),
      endDateTime: new Date("2026-01-01T15:00:00.000Z"),
      timezone: "Asia/Kolkata",
      status: EventStatus.PUBLISHED,
      privacyType: EventPrivacyType.PUBLIC,
      shortCode: `Az${suffix.slice(0, 5)}`,
    },
  });
  eventId = event.id;
});

afterAll(async () => {
  await prisma.organisation.deleteMany({ where: { id: organisationId } });
  await prisma.$disconnect();
});

describe("analytics insights (database)", () => {
  it("dates joining and leaving the waitlist, whichever code changes the status", async () => {
    const confirmed = await rsvp(`going-${suffix}@example.com`, RsvpStatus.CONFIRMED);
    expect(confirmed.waitlistedAt).toBeNull();
    expect(confirmed.promotedAt).toBeNull();

    const promoted = await rsvp(`promoted-${suffix}@example.com`, RsvpStatus.WAITLISTED);
    expect(promoted.waitlistedAt).toBeInstanceOf(Date);
    const afterPromotion = await prisma.rSVP.update({ where: { id: promoted.id }, data: { status: RsvpStatus.CONFIRMED } });
    expect(afterPromotion.promotedAt).toBeInstanceOf(Date);
    expect(afterPromotion.waitlistedAt).toEqual(promoted.waitlistedAt);

    const rejected = await rsvp(`rejected-${suffix}@example.com`, RsvpStatus.WAITLISTED);
    const afterRejection = await prisma.rSVP.update({ where: { id: rejected.id }, data: { status: RsvpStatus.REJECTED } });
    expect(afterRejection.promotedAt).toBeNull();

    await rsvp(`waiting-${suffix}@example.com`, RsvpStatus.WAITLISTED);

    const metrics = await getEventReportMetrics(eventId);
    expect(metrics!.waitlist).toEqual({ joined: 3, promoted: 1 });
  });

  it("counts short-link visits per local day, as a number only", async () => {
    const evening = new Date("2026-01-01T20:30:00.000Z"); // 02:00 on 2 January in Kochi
    await recordShortLinkVisit(eventId, "Asia/Kolkata", evening);
    await recordShortLinkVisit(eventId, "Asia/Kolkata", evening);
    await recordShortLinkVisit(eventId, "Asia/Kolkata", new Date("2026-01-01T10:00:00.000Z"));
    const days = await prisma.shortLinkClickDay.findMany({ where: { eventId }, orderBy: { day: "asc" } });
    expect(days.map((day) => [day.day.toISOString().slice(0, 10), day.count])).toEqual([
      ["2026-01-01", 1],
      ["2026-01-02", 2],
    ]);
    // The table has nowhere to put anything about a visitor.
    expect(Object.keys(days[0]!).sort()).toEqual(["count", "day", "eventId"]);
    expect((await getEventReportMetrics(eventId))!.shortLinkVisits).toBe(3);
  });

  it("refuses a negative count and removes counts with the event", async () => {
    await expect(prisma.shortLinkClickDay.create({ data: { eventId, day: new Date("2026-01-05"), count: -1 } })).rejects.toThrow();
    const other = await prisma.event.create({
      data: {
        organisationId,
        title: "Gone",
        slug: `gone-${suffix}`,
        startDateTime: new Date("2026-01-01T12:00:00.000Z"),
        endDateTime: new Date("2026-01-01T13:00:00.000Z"),
        timezone: "UTC",
      },
    });
    await recordShortLinkVisit(other.id, "UTC");
    await prisma.event.delete({ where: { id: other.id } });
    expect(await prisma.shortLinkClickDay.count({ where: { eventId: other.id } })).toBe(0);
  });
});
