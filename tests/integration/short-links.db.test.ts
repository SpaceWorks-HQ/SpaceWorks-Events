import { randomUUID } from "node:crypto";
import { EventPrivacyType, EventStatus, MembershipRole, Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { isShortCodeShape } from "@/lib/shortLink";
import { resolveShortCode } from "@/lib/shortLinkResolve";
import { createEventShortLink, regenerateEventShortLink } from "@/app/actions/shortLink";

const suffix = randomUUID().replace(/-/g, "");
const SHORT_LINK_ACTIONS = ["EVENT_SHORT_LINK_CREATED", "EVENT_SHORT_LINK_REGENERATED"];

let orgAId: string;
let orgASlug: string;
let orgBId: string;
let orgBSlug: string;
let ownerId: string;
let adminId: string;
let memberId: string;
let outsiderId: string;
let ownerBId: string;
const userIds: string[] = [];

let eventCounter = 0;

async function makeEvent(
  organisationId: string,
  options: { status?: EventStatus; page?: boolean | null } = {},
) {
  eventCounter += 1;
  const event = await prisma.event.create({
    data: {
      organisationId,
      title: `Short link event ${eventCounter}`,
      slug: `short-link-${eventCounter}-${suffix}`,
      startDateTime: new Date("2030-01-01T10:00:00.000Z"),
      endDateTime: new Date("2030-01-01T11:00:00.000Z"),
      timezone: "UTC",
      status: options.status ?? EventStatus.PUBLISHED,
      privacyType: EventPrivacyType.PUBLIC,
    },
  });
  const page = options.page === undefined ? true : options.page;
  if (page !== null) await prisma.eventPage.create({ data: { eventId: event.id, isPublished: page } });
  return event;
}

function shortLinkAudits(eventId: string) {
  return prisma.auditEvent.findMany({
    where: { targetType: "Event", targetId: eventId, action: { in: SHORT_LINK_ACTIONS } },
    orderBy: { createdAt: "asc" },
  });
}

async function storedCode(eventId: string) {
  return (await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { shortCode: true } })).shortCode;
}

function as(userId: string) {
  identity.id = userId;
}

describe.sequential("event short links", () => {
  beforeAll(async () => {
    orgASlug = `short-a-${suffix}`;
    orgBSlug = `short-b-${suffix}`;
    const [orgA, orgB] = await Promise.all([
      prisma.organisation.create({ data: { name: "Short link org A", slug: orgASlug } }),
      prisma.organisation.create({ data: { name: "Short link org B", slug: orgBSlug } }),
    ]);
    orgAId = orgA.id;
    orgBId = orgB.id;
    const users = await Promise.all(
      ["owner", "admin", "member", "outsider", "owner-b"].map((label) =>
        prisma.user.create({ data: { name: `Short ${label}`, email: `short-${label}-${suffix}@example.test` } }),
      ),
    );
    [ownerId, adminId, memberId, outsiderId, ownerBId] = users.map((user) => user.id);
    userIds.push(...users.map((user) => user.id));
    await prisma.membership.createMany({
      data: [
        { userId: ownerId, organisationId: orgAId, role: MembershipRole.OWNER },
        { userId: adminId, organisationId: orgAId, role: MembershipRole.ADMIN },
        { userId: memberId, organisationId: orgAId, role: MembershipRole.MEMBER },
        { userId: ownerBId, organisationId: orgBId, role: MembershipRole.OWNER },
      ],
    });
  });

  beforeEach(() => {
    identity.id = "";
  });

  afterAll(async () => {
    const orgIds = [orgAId, orgBId].filter(Boolean);
    const events = await prisma.event.findMany({ where: { organisationId: { in: orgIds } }, select: { id: true } });
    await prisma.organisation.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.auditEvent.deleteMany({ where: { targetType: "Event", targetId: { in: events.map((event) => event.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe("creation and authorization", () => {
    it("lets an OWNER create a shape-valid code and audits it without the code", async () => {
      const event = await makeEvent(orgAId);
      as(ownerId);
      const result = await createEventShortLink({ organisationSlug: orgASlug, eventId: event.id });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(isShortCodeShape(result.code)).toBe(true);
      await expect(storedCode(event.id)).resolves.toBe(result.code);

      const audits = await shortLinkAudits(event.id);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ action: "EVENT_SHORT_LINK_CREATED", actorUserId: ownerId, organisationId: orgAId });
      expect(JSON.stringify(audits[0].metadata ?? null)).not.toContain(result.code);
    });

    it("lets an ADMIN create a code", async () => {
      const event = await makeEvent(orgAId);
      as(adminId);
      const result = await createEventShortLink({ organisationSlug: orgASlug, eventId: event.id });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(isShortCodeShape(result.code)).toBe(true);
      await expect(storedCode(event.id)).resolves.toBe(result.code);
      const audits = await shortLinkAudits(event.id);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ action: "EVENT_SHORT_LINK_CREATED", actorUserId: adminId });
      expect(JSON.stringify(audits[0].metadata ?? null)).not.toContain(result.code);
    });

    it("rejects MEMBER, non-member and signed-out callers without writing", async () => {
      const event = await makeEvent(orgAId);
      for (const userId of [memberId, outsiderId, ownerBId, ""]) {
        as(userId);
        const created = await createEventShortLink({ organisationSlug: orgASlug, eventId: event.id });
        const regenerated = await regenerateEventShortLink({ organisationSlug: orgASlug, eventId: event.id });
        expect(created.ok).toBe(false);
        expect(regenerated.ok).toBe(false);
      }
      await expect(storedCode(event.id)).resolves.toBeNull();
      await expect(shortLinkAudits(event.id)).resolves.toHaveLength(0);
    });

    it("rejects an event from another organisation as not found, in both directions", async () => {
      const eventA = await makeEvent(orgAId);
      const eventB = await makeEvent(orgBId);

      as(ownerId);
      await expect(createEventShortLink({ organisationSlug: orgASlug, eventId: eventB.id })).resolves.toEqual({ ok: false, error: "Event not found." });
      await expect(regenerateEventShortLink({ organisationSlug: orgASlug, eventId: eventB.id })).resolves.toEqual({ ok: false, error: "Event not found." });

      as(ownerBId);
      await expect(createEventShortLink({ organisationSlug: orgBSlug, eventId: eventA.id })).resolves.toEqual({ ok: false, error: "Event not found." });
      await expect(regenerateEventShortLink({ organisationSlug: orgBSlug, eventId: eventA.id })).resolves.toEqual({ ok: false, error: "Event not found." });

      await expect(storedCode(eventA.id)).resolves.toBeNull();
      await expect(storedCode(eventB.id)).resolves.toBeNull();
      await expect(shortLinkAudits(eventA.id)).resolves.toHaveLength(0);
      await expect(shortLinkAudits(eventB.id)).resolves.toHaveLength(0);
    });

    it("rejects malformed input", async () => {
      const event = await makeEvent(orgAId);
      as(ownerId);
      await expect(createEventShortLink({ organisationSlug: orgASlug, eventId: event.id, shortCode: "AAAAAAA" })).resolves.toEqual({ ok: false, error: "Invalid request." });
      await expect(createEventShortLink({ organisationSlug: "", eventId: event.id })).resolves.toEqual({ ok: false, error: "Invalid request." });
      await expect(storedCode(event.id)).resolves.toBeNull();
    });
  });

  describe("idempotency and concurrency", () => {
    it("returns the same code on a repeat create without a second audit row", async () => {
      const event = await makeEvent(orgAId);
      as(ownerId);
      const first = await createEventShortLink({ organisationSlug: orgASlug, eventId: event.id });
      const second = await createEventShortLink({ organisationSlug: orgASlug, eventId: event.id });
      expect(first.ok && second.ok).toBe(true);
      expect(second).toEqual(first);
      await expect(shortLinkAudits(event.id)).resolves.toHaveLength(1);
    });

    it("settles concurrent creates on exactly one code shared by both callers", async () => {
      for (let round = 0; round < 5; round += 1) {
        const event = await makeEvent(orgAId);
        as(ownerId);
        const results = await Promise.all([
          createEventShortLink({ organisationSlug: orgASlug, eventId: event.id }),
          createEventShortLink({ organisationSlug: orgASlug, eventId: event.id }),
        ]);
        const stored = await storedCode(event.id);
        expect(stored).not.toBeNull();
        expect(results).toEqual([{ ok: true, code: stored }, { ok: true, code: stored }]);
        const audits = await shortLinkAudits(event.id);
        expect(audits).toHaveLength(1);
        expect(audits[0].action).toBe("EVENT_SHORT_LINK_CREATED");
      }
    });
  });

  describe("regeneration", () => {
    it("replaces the code so only the new one resolves, and audits REGENERATED", async () => {
      const event = await makeEvent(orgAId);
      as(adminId);
      const created = await createEventShortLink({ organisationSlug: orgASlug, eventId: event.id });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const regenerated = await regenerateEventShortLink({ organisationSlug: orgASlug, eventId: event.id });
      expect(regenerated.ok).toBe(true);
      if (!regenerated.ok) return;

      expect(regenerated.code).not.toBe(created.code);
      expect(isShortCodeShape(regenerated.code)).toBe(true);
      await expect(storedCode(event.id)).resolves.toBe(regenerated.code);
      await expect(resolveShortCode(created.code)).resolves.toBeNull();
      await expect(resolveShortCode(regenerated.code)).resolves.toBe(`/${orgASlug}/${event.slug}`);

      const audits = await shortLinkAudits(event.id);
      expect(audits.map((audit) => audit.action)).toEqual(["EVENT_SHORT_LINK_CREATED", "EVENT_SHORT_LINK_REGENERATED"]);
      for (const audit of audits) {
        const metadata = JSON.stringify(audit.metadata ?? null);
        expect(metadata).not.toContain(created.code);
        expect(metadata).not.toContain(regenerated.code);
      }
    });

    it("regenerating an event without a code creates one and audits CREATED", async () => {
      const event = await makeEvent(orgAId);
      as(ownerId);
      const result = await regenerateEventShortLink({ organisationSlug: orgASlug, eventId: event.id });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      await expect(storedCode(event.id)).resolves.toBe(result.code);
      const audits = await shortLinkAudits(event.id);
      expect(audits.map((audit) => audit.action)).toEqual(["EVENT_SHORT_LINK_CREATED"]);
    });
  });

  describe("database integrity", () => {
    it("rejects two events sharing one short code with P2002", async () => {
      const first = await makeEvent(orgAId);
      const second = await makeEvent(orgBId);
      const code = `Dup${suffix.slice(0, 4)}`;
      await prisma.event.update({ where: { id: first.id }, data: { shortCode: code } });
      const error = await prisma.event.update({ where: { id: second.id }, data: { shortCode: code } }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
      await expect(storedCode(second.id)).resolves.toBeNull();
    });

    it("allows many events without a short code", async () => {
      const first = await makeEvent(orgAId);
      const second = await makeEvent(orgAId);
      await expect(storedCode(first.id)).resolves.toBeNull();
      await expect(storedCode(second.id)).resolves.toBeNull();
    });
  });

  describe("resolveShortCode", () => {
    let codeCounter = 0;
    async function withCode(eventId: string) {
      codeCounter += 1;
      const code = `R${String(codeCounter)}${suffix.slice(0, 6 - String(codeCounter).length)}`;
      expect(isShortCodeShape(code)).toBe(true);
      await prisma.event.update({ where: { id: eventId }, data: { shortCode: code } });
      return code;
    }

    it("resolves a published event with a released page to its canonical path", async () => {
      const event = await makeEvent(orgAId);
      const code = await withCode(event.id);
      await expect(resolveShortCode(code)).resolves.toBe(`/${orgASlug}/${event.slug}`);
    });

    it.each([EventStatus.DRAFT, EventStatus.HIDDEN, EventStatus.CANCELLED])("returns null for a %s event even with a released page", async (status) => {
      const event = await makeEvent(orgAId, { status });
      const code = await withCode(event.id);
      await expect(resolveShortCode(code)).resolves.toBeNull();
    });

    it("covers every non-published EventStatus value", () => {
      expect(Object.values(EventStatus).sort()).toEqual([EventStatus.CANCELLED, EventStatus.DRAFT, EventStatus.HIDDEN, EventStatus.PUBLISHED].sort());
    });

    it("returns null for a published event whose page is unreleased or missing", async () => {
      const unreleased = await makeEvent(orgAId, { page: false });
      const noPage = await makeEvent(orgAId, { page: null });
      await expect(resolveShortCode(await withCode(unreleased.id))).resolves.toBeNull();
      await expect(resolveShortCode(await withCode(noPage.id))).resolves.toBeNull();
    });

    it("returns null for unknown or malformed codes", async () => {
      await expect(resolveShortCode("ZZzz9q0")).resolves.toBeNull();
      await expect(resolveShortCode("lowercase")).resolves.toBeNull();
      await expect(resolveShortCode("abcdefg")).resolves.toBeNull();
      await expect(resolveShortCode("")).resolves.toBeNull();
    });

    it("follows an event slug change with the same code", async () => {
      const event = await makeEvent(orgAId);
      const code = await withCode(event.id);
      await expect(resolveShortCode(code)).resolves.toBe(`/${orgASlug}/${event.slug}`);
      const renamed = `renamed-${suffix}`;
      await prisma.event.update({ where: { id: event.id }, data: { slug: renamed } });
      await expect(resolveShortCode(code)).resolves.toBe(`/${orgASlug}/${renamed}`);
    });

    it("stops resolving when the event is unpublished and resumes when republished", async () => {
      const event = await makeEvent(orgAId);
      const code = await withCode(event.id);
      await prisma.event.update({ where: { id: event.id }, data: { status: EventStatus.HIDDEN } });
      await expect(resolveShortCode(code)).resolves.toBeNull();
      await prisma.event.update({ where: { id: event.id }, data: { status: EventStatus.PUBLISHED } });
      await expect(resolveShortCode(code)).resolves.toBe(`/${orgASlug}/${event.slug}`);
    });
  });
});
