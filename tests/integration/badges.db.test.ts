import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EventPermission, EventPrivacyType, EventStatus, MembershipRole, RsvpStatus } from "@prisma/client";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: async () => true, getClientIpFromHeaders: () => "203.0.113.1" }));

import { getBadgeDesign, saveBadgeDesign } from "@/app/actions/badge";
import { GET as bulkBadges } from "@/app/api/exports/events/[eventId]/badges/route";
import { GET as oneBadge } from "@/app/api/exports/events/[eventId]/badges/[rsvpId]/route";
import { prisma } from "@/lib/db";

const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const ids = {
  orgA: "", orgB: "", eventA: "", eventB: "",
  owner: "", outsider: "", member: "", collaborator: "",
  rsvpA: "", rsvpB: "",
};

const as = (userId: string) => {
  identity.id = userId;
};

const bulk = (eventId: string, query = "format=pdf&status=confirmed") =>
  bulkBadges(new Request(`https://events.example.test/api/exports/events/${eventId}/badges?${query}`), { params: Promise.resolve({ eventId }) });
const single = (eventId: string, rsvpId: string, format = "pdf") =>
  oneBadge(new Request(`https://events.example.test/api/exports/events/${eventId}/badges/${rsvpId}?format=${format}`), { params: Promise.resolve({ eventId, rsvpId }) });

describe.sequential("badge design and download authorisation", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    const user = (name: string) => prisma.user.create({ data: { name, email: `${name}-${suffix}@example.test` } });
    const [owner, outsider, member, collaborator] = await Promise.all([user("owner"), user("outsider"), user("member"), user("collaborator")]);
    Object.assign(ids, { owner: owner.id, outsider: outsider.id, member: member.id, collaborator: collaborator.id });
    const orgA = await prisma.organisation.create({ data: { name: "Org A", slug: `badges-a-${suffix}` } });
    const orgB = await prisma.organisation.create({ data: { name: "Org B", slug: `badges-b-${suffix}` } });
    Object.assign(ids, { orgA: orgA.id, orgB: orgB.id });
    await prisma.membership.createMany({ data: [
      { userId: owner.id, organisationId: orgA.id, role: MembershipRole.OWNER },
      { userId: member.id, organisationId: orgA.id, role: MembershipRole.MEMBER },
      // The outsider runs another organisation.
      { userId: outsider.id, organisationId: orgB.id, role: MembershipRole.OWNER },
    ] });
    const eventData = (organisationId: string, slug: string) => ({
      organisationId,
      title: `Badge test ${slug}`,
      slug,
      startDateTime: new Date("2035-01-01T10:00:00Z"),
      endDateTime: new Date("2035-01-01T12:00:00Z"),
      timezone: "UTC",
      status: EventStatus.PUBLISHED,
      privacyType: EventPrivacyType.PUBLIC,
    });
    const eventA = await prisma.event.create({ data: eventData(orgA.id, `badges-a-${suffix}`) });
    const eventB = await prisma.event.create({ data: eventData(orgB.id, `badges-b-${suffix}`) });
    Object.assign(ids, { eventA: eventA.id, eventB: eventB.id });
    await prisma.eventCollaborator.create({ data: { eventId: eventA.id, userId: collaborator.id, permissions: [EventPermission.CHECK_IN] } });
    const rsvp = (eventId: string, key: string, status: RsvpStatus) => prisma.rSVP.create({ data: { eventId, attendeeKey: `guest:${key}-${suffix}@example.test`, guestName: `Guest ${key}`, guestEmail: `${key}-${suffix}@example.test`, status } });
    const [rsvpA] = await Promise.all([rsvp(eventA.id, "a1", RsvpStatus.CONFIRMED), rsvp(eventA.id, "a2", RsvpStatus.CONFIRMED), rsvp(eventA.id, "a3", RsvpStatus.WAITLISTED)]);
    const rsvpB = await rsvp(eventB.id, "b1", RsvpStatus.CONFIRMED);
    Object.assign(ids, { rsvpA: rsvpA.id, rsvpB: rsvpB.id });
  }, 60_000);

  afterAll(async () => {
    identity.id = "";
    await prisma.organisation.deleteMany({ where: { id: { in: [ids.orgA, ids.orgB].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.owner, ids.outsider, ids.member, ids.collaborator].filter(Boolean) } } });
    await prisma.$disconnect();
  }, 60_000);

  const orgASlug = () => `badges-a-${suffix}`;
  const orgBSlug = () => `badges-b-${suffix}`;

  it("lets an organiser save a normalised design and read it back", async () => {
    as(ids.owner);
    const saved = await saveBadgeDesign({ organisationSlug: orgASlug(), eventId: ids.eventA, settings: { colorMode: "colour", template: "bold", backgroundColor: "cream", accentColor: "<script>", heading: "  Summit  " } });
    expect(saved.ok).toBe(true);
    const row = await prisma.eventBadgeDesign.findUniqueOrThrow({ where: { eventId: ids.eventA } });
    expect(row.updatedById).toBe(ids.owner);
    expect(row.settings).toMatchObject({ template: "bold", backgroundColor: "cream", accentColor: "event", heading: "Summit" });
    const read = await getBadgeDesign({ organisationSlug: orgASlug(), eventId: ids.eventA });
    expect(read.ok && read.data).toMatchObject({ saved: true, settings: { template: "bold" } });
  });

  it("lets a check-in collaborator save, but not a plain member", async () => {
    as(ids.collaborator);
    expect((await saveBadgeDesign({ organisationSlug: orgASlug(), eventId: ids.eventA, settings: { colorMode: "colour", template: "minimal", widthMm: 85.6, heightMm: 53.98 } })).ok).toBe(true);
    as(ids.member);
    const denied = await saveBadgeDesign({ organisationSlug: orgASlug(), eventId: ids.eventA, settings: { colorMode: "mono", template: "classic" } });
    expect(denied.ok).toBe(false);
    expect((await getBadgeDesign({ organisationSlug: orgASlug(), eventId: ids.eventA })).ok).toBe(false);
    const row = await prisma.eventBadgeDesign.findUniqueOrThrow({ where: { eventId: ids.eventA } });
    expect(row.settings).toMatchObject({ template: "minimal" });
  });

  it("never lets another organisation read or write the design", async () => {
    as(ids.outsider);
    for (const organisationSlug of [orgASlug(), orgBSlug()]) {
      expect((await getBadgeDesign({ organisationSlug, eventId: ids.eventA })).ok).toBe(false);
      expect((await saveBadgeDesign({ organisationSlug, eventId: ids.eventA, settings: { colorMode: "mono" } })).ok).toBe(false);
    }
    const row = await prisma.eventBadgeDesign.findUniqueOrThrow({ where: { eventId: ids.eventA } });
    expect(row.settings).toMatchObject({ template: "minimal", colorMode: "colour" });
    as("");
    expect((await getBadgeDesign({ organisationSlug: orgASlug(), eventId: ids.eventA })).ok).toBe(false);
  });

  it("rejects oversized or malformed designs before touching the database", async () => {
    as(ids.owner);
    const huge = await saveBadgeDesign({ organisationSlug: orgASlug(), eventId: ids.eventA, settings: { heading: "x".repeat(40_000) } });
    expect(huge).toMatchObject({ ok: false, error: "That badge design is too large to save." });
    expect((await saveBadgeDesign({ organisationSlug: orgASlug(), eventId: ids.eventA, settings: [1, 2] })).ok).toBe(false);
    expect((await saveBadgeDesign({ organisationSlug: orgASlug(), eventId: ids.eventA, settings: {}, extra: true })).ok).toBe(false);
  });

  it("serves bulk and single badges only to the event's own check-in staff", async () => {
    as(ids.outsider);
    expect((await bulk(ids.eventA)).status).toBe(404);
    expect((await single(ids.eventA, ids.rsvpA)).status).toBe(404);
    as(ids.member);
    expect((await bulk(ids.eventA)).status).toBe(404);
    as("");
    expect((await bulk(ids.eventA)).status).toBe(404);

    as(ids.owner);
    const response = await bulk(ids.eventA);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    const pdf = await PDFDocument.load(new Uint8Array(await response.arrayBuffer()));
    // Two confirmed attendees; the waitlisted one is not included, and nothing from the other organisation.
    expect(pdf.getPageCount()).toBe(2);
    const all = await PDFDocument.load(new Uint8Array(await (await bulk(ids.eventA, "format=pdf&status=all&layout=a4")).arrayBuffer()));
    // Three CR80 badges share one A4 sheet.
    expect(all.getPageCount()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "BADGES_EXPORTED", targetId: ids.eventA } })).toBe(2);

    // An RSVP of another organisation's event is never rendered through this event.
    expect((await single(ids.eventA, ids.rsvpB)).status).toBe(404);
    const png = await single(ids.eventA, ids.rsvpA, "png");
    expect(png.status).toBe(200);
    expect(png.headers.get("content-type")).toBe("image/png");
    expect((await single(ids.eventA, ids.rsvpA, "svg")).status).toBe(400);
    expect((await bulk(ids.eventA, "format=pdf&status=everyone")).status).toBe(400);
  });

  it("removes the design with its event", async () => {
    await prisma.event.delete({ where: { id: ids.eventA } });
    expect(await prisma.eventBadgeDesign.count({ where: { eventId: ids.eventA } })).toBe(0);
  });
});
