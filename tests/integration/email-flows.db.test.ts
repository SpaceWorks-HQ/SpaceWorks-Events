import { randomUUID } from "node:crypto";
import { EventPrivacyType, EventStatus, MembershipRole, RsvpStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { updateEvent } from "@/app/actions/event";
import { addSeriesInvite } from "@/app/actions/invites";
import { deleteRsvp, restoreRsvp } from "@/app/actions/rsvp-admin";
import { cancelRsvp } from "@/app/actions/rsvp-cancel";
import { prisma } from "@/lib/db";
import { sendEventReminders } from "@/lib/eventReminders";
import { noticeOrganisersOfRequest } from "@/lib/notices";
import { fillWaitlists } from "@/lib/payments/operations";

const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
const email = (name: string) => `${name}-${suffix}@example.test`;
const HOUR = 3_600_000;
let owner = "";
let organisationId = "";
const organisationSlug = `emails-${suffix}`;
let counter = 0;

async function event(options: { startsIn?: number; capacity?: number | null; privacyType?: EventPrivacyType; } = {}) {
  counter += 1;
  const start = new Date(Date.now() + (options.startsIn ?? 7 * 24 * HOUR));
  return prisma.event.create({
    data: {
      organisationId, title: `Email event ${counter}`, slug: `email-${suffix}-${counter}`, timezone: "Asia/Kolkata", location: "Main hall",
      startDateTime: start, endDateTime: new Date(start.getTime() + 2 * HOUR), status: EventStatus.PUBLISHED, capacity: options.capacity ?? null,
      privacyType: options.privacyType ?? EventPrivacyType.PUBLIC,
    },
  });
}

async function guest(eventId: string, name: string, status: RsvpStatus = RsvpStatus.CONFIRMED, createdAt = new Date(Date.now() - 2 * 24 * HOUR)) {
  return prisma.rSVP.create({ data: { eventId, guestEmail: email(name), guestName: name, attendeeKey: `guest:${email(name)}`, status, createdAt } });
}

const noticesTo = (name: string, kind = "operator-notice") =>
  prisma.outboxMessage.findMany({ where: { kind, payload: { path: ["to"], equals: email(name) } }, select: { payload: true, availableAt: true, status: true } });

beforeAll(async () => {
  owner = (await prisma.user.create({ data: { name: "Owner", email: email("owner"), emailVerified: new Date() } })).id;
  organisationId = (await prisma.organisation.create({ data: { name: "Email Makers", slug: organisationSlug } })).id;
  await prisma.membership.create({ data: { userId: owner, organisationId, role: MembershipRole.OWNER } });
});

afterAll(async () => {
  identity.id = "";
  await prisma.outboxMessage.deleteMany({ where: { payload: { path: ["to"], string_contains: suffix } } });
  await prisma.organisation.deleteMany({ where: { id: organisationId } });
  await prisma.user.deleteMany({ where: { id: owner } });
});

describe("email flows", () => {
  it("reminds each confirmed guest once, a day ahead, skipping people who just signed up", async () => {
    const soon = await event({ startsIn: 20 * HOUR });
    const later = await event({ startsIn: 5 * 24 * HOUR });
    await guest(soon.id, "remind-me");
    await guest(soon.id, "remind-waitlisted", RsvpStatus.WAITLISTED);
    await guest(soon.id, "remind-new", RsvpStatus.CONFIRMED, new Date());
    await guest(later.id, "remind-later");

    expect((await sendEventReminders()).queued).toBeGreaterThanOrEqual(1);
    const queued = await noticesTo("remind-me", "event-reminder");
    expect(queued).toHaveLength(1);
    // The queue holds the registration, never the ticket link.
    expect(JSON.stringify(queued[0]!.payload)).not.toContain("ticket");
    for (const name of ["remind-waitlisted", "remind-new", "remind-later"]) expect(await noticesTo(name, "event-reminder")).toHaveLength(0);

    await sendEventReminders();
    expect(await noticesTo("remind-me", "event-reminder")).toHaveLength(1);
  });

  it("fills every free seat from the waitlist in order, after a capacity increase", async () => {
    const full = await event({ capacity: 1 });
    await guest(full.id, "seat-holder");
    const first = await guest(full.id, "wait-1", RsvpStatus.WAITLISTED, new Date(Date.now() - 3 * HOUR));
    const second = await guest(full.id, "wait-2", RsvpStatus.WAITLISTED, new Date(Date.now() - 2 * HOUR));
    const third = await guest(full.id, "wait-3", RsvpStatus.WAITLISTED, new Date(Date.now() - HOUR));
    await prisma.event.update({ where: { id: full.id }, data: { capacity: 3 } });

    await fillWaitlists();
    const statuses = await prisma.rSVP.findMany({ where: { id: { in: [first.id, second.id, third.id] } }, orderBy: { createdAt: "asc" }, select: { status: true } });
    expect(statuses.map((row) => row.status)).toEqual([RsvpStatus.CONFIRMED, RsvpStatus.CONFIRMED, RsvpStatus.WAITLISTED]);
    expect(await noticesTo("wait-1", "rsvp-status")).toHaveLength(1);
    expect(await noticesTo("wait-3", "rsvp-status")).toHaveLength(0);
  });

  it("tells a removed guest after the undo window, and not at all when the removal is undone", async () => {
    const target = await event();
    const removed = await guest(target.id, "removed");
    const restored = await guest(target.id, "restored");
    identity.id = owner;

    expect(await deleteRsvp({ organisationSlug, eventId: target.id, rsvpId: removed.id })).toMatchObject({ ok: true });
    const [notice] = await noticesTo("removed");
    expect(notice!.availableAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);

    const undo = await deleteRsvp({ organisationSlug, eventId: target.id, rsvpId: restored.id });
    expect(undo.ok).toBe(true);
    expect(await noticesTo("restored")).toHaveLength(1);
    expect(await restoreRsvp({ organisationSlug, undoId: undo.ok ? undo.data!.undoId : "" })).toMatchObject({ ok: true });
    expect(await noticesTo("restored")).toHaveLength(0);
    identity.id = "";
  });

  it("confirms a guest's own cancellation", async () => {
    const target = await event();
    const rsvp = await guest(target.id, "leaver");
    expect(await cancelRsvp({ checkInToken: rsvp.checkInToken })).toMatchObject({ ok: true });
    const [notice] = await noticesTo("leaver");
    expect(notice!.payload).toMatchObject({ subject: `Cancelled: ${target.title}` });
  });

  it("tells guests when the time or place changes, not when the wording does", async () => {
    const target = await event();
    await guest(target.id, "attendee");
    identity.id = owner;
    const base = {
      organisationSlug, eventId: target.id, title: target.title, timezone: target.timezone, location: target.location, isOnline: false,
      startDateTime: target.startDateTime.toISOString(), endDateTime: target.endDateTime.toISOString(), status: EventStatus.PUBLISHED, privacyType: EventPrivacyType.PUBLIC,
    };
    expect(await updateEvent({ ...base, description: "New wording." })).toMatchObject({ ok: true });
    expect(await noticesTo("attendee")).toHaveLength(0);
    expect(await updateEvent({ ...base, location: "Room 2" })).toMatchObject({ ok: true });
    const [notice] = await noticesTo("attendee");
    expect(notice!.payload).toMatchObject({ subject: `Updated: ${target.title}` });
    expect(JSON.stringify(notice!.payload)).toContain("Where: Room 2");
    identity.id = "";
  });

  it("tells organisers about join requests at most once per half hour", async () => {
    const target = await event({ privacyType: EventPrivacyType.APPROVAL_REQUIRED });
    expect(await noticeOrganisersOfRequest(prisma, { eventId: target.id })).toBe(1);
    expect(await noticeOrganisersOfRequest(prisma, { eventId: target.id })).toBe(0);
    const [notice] = await noticesTo("owner");
    expect(JSON.stringify(notice!.payload)).toContain(`/dashboard/${organisationSlug}/event/${target.id}`);
  });

  it("emails a series invite with a link to the next date", async () => {
    const series = await prisma.eventSeries.create({ data: { organisationId, title: "Weekly club", slug: `club-${suffix}`, recurrenceRule: "FREQ=WEEKLY", timezone: "UTC", status: EventStatus.PUBLISHED } });
    const next = await prisma.eventInstance.create({ data: { eventSeriesId: series.id, startDateTime: new Date(Date.now() + 2 * 24 * HOUR), endDateTime: new Date(Date.now() + 2 * 24 * HOUR + HOUR) } });
    identity.id = owner;
    expect(await addSeriesInvite({ organisationSlug, eventSeriesId: series.id, email: email("series-guest") })).toEqual({ ok: true });
    identity.id = "";
    const [invite] = await noticesTo("series-guest", "event-invite");
    expect(invite!.payload).toMatchObject({ eventTitle: "Weekly club", eventPath: `/${organisationSlug}/i/${next.id}` });
  });
});
