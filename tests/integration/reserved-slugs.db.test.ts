import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MembershipRole } from "@prisma/client";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { cloneEvent, createEvent, updateEventSlug } from "@/app/actions/event";
import { checkSlugAvailability, createOrganisation } from "@/app/actions/org";
import { prisma } from "@/lib/db";

const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const organisationSlug = `reserved-${suffix}`;
let organisationId = "";
let userId = "";
const futureDay = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
const event = (title: string) => ({
  organisationSlug,
  title,
  description: "A useful description.",
  aboutHtml: "<p>A useful description.</p>",
  startDateTime: `${futureDay}T18:00:00.000Z`,
  endDateTime: `${futureDay}T20:00:00.000Z`,
  timezone: "UTC",
  isOnline: false,
  location: "Main auditorium",
});

describe.sequential("reserved slugs", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { name: "Owner", email: `reserved-${suffix}@example.test`, emailVerified: new Date() } });
    userId = user.id;
    const organisation = await prisma.organisation.create({ data: { name: "Reserved", slug: organisationSlug } });
    organisationId = organisation.id;
    await prisma.membership.create({ data: { userId, organisationId, role: MembershipRole.OWNER } });
    identity.id = userId;
  });

  afterAll(async () => {
    identity.id = "";
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("never generates an event slug that a member ID route would shadow", async () => {
    const ids = await createEvent(event("IDs"));
    expect(ids).toMatchObject({ ok: true, data: { slug: "ids-1" } });
    const i = await createEvent(event("I"));
    expect(i).toMatchObject({ ok: true, data: { slug: "i-1" } });
    const plain = await createEvent(event("Launch night"));
    expect(plain).toMatchObject({ ok: true, data: { slug: "launch-night" } });
  });

  it("refuses to rename an event to a reserved slug", async () => {
    const created = await prisma.event.findFirstOrThrow({ where: { organisationId, slug: "launch-night" } });
    const result = await updateEventSlug({ organisationSlug, eventId: created.id, slug: "ids" });
    expect(result).toMatchObject({ ok: false, fieldErrors: { slug: ["That URL is reserved"] } });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: created.id } })).slug).toBe("launch-night");
    expect(await cloneEvent({ organisationSlug, eventId: created.id })).toMatchObject({ ok: true });
  });

  it("refuses organisation slugs that shadow top-level routes", async () => {
    for (const slug of ["verify", "account", "about"]) {
      expect(await createOrganisation({ name: "Shadow", slug, description: "", logoUrl: "" })).toMatchObject({ ok: false, fieldErrors: { slug: ["That URL is reserved"] } });
    }
    expect(await prisma.organisation.count({ where: { slug: { in: ["verify", "account", "about"] } } })).toBe(0);
  });

  it("explains why an organisation slug can't be used before submitting", async () => {
    expect(await checkSlugAvailability("dashboard")).toEqual({ available: false, error: "That URL is reserved" });
    expect(await checkSlugAvailability("a")).toEqual({ available: false, error: "Slug must be at least 2 characters" });
    expect(await checkSlugAvailability("--x--")).toEqual({ available: false, error: "Use lowercase letters, numbers, and single hyphens" });
    expect(await checkSlugAvailability(organisationSlug)).toEqual({ available: false, error: "That URL is already taken" });
    expect(await checkSlugAvailability(`free-${suffix}`)).toEqual({ available: true });
  });
});
