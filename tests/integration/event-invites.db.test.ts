import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EventPermission, MembershipRole } from "@prisma/client";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/outboxWorker", () => ({ startOutboxWorker: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { addEventInvite, removeEventInvite } from "@/app/actions/invites";
import { prisma } from "@/lib/db";

const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const organisationSlug = `invites-${suffix}`;
const users: Record<"inviter" | "checker" | "member", string> = { inviter: "", checker: "", member: "" };
let organisationId = "";
let eventId = "";
const start = new Date(Date.now() + 7 * 86_400_000);

const asUser = (id: string) => {
  identity.id = id;
};

describe.sequential("event invites by co-organisers", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    const organisation = await prisma.organisation.create({ data: { name: "Invites", slug: organisationSlug } });
    organisationId = organisation.id;
    for (const key of Object.keys(users) as Array<keyof typeof users>) {
      users[key] = (await prisma.user.create({ data: { name: key, email: `${key}-${suffix}@example.test`, emailVerified: new Date() } })).id;
    }
    await prisma.membership.create({ data: { userId: users.member, organisationId, role: MembershipRole.MEMBER } });
    const event = await prisma.event.create({
      data: { organisationId, title: "Invite only", slug: "invite-only", description: "Private.", startDateTime: start, endDateTime: new Date(start.getTime() + 3_600_000), timezone: "UTC", location: "Main hall" },
    });
    eventId = event.id;
    await prisma.eventCollaborator.create({ data: { eventId, userId: users.inviter, permissions: [EventPermission.MANAGE_INVITATIONS] } });
    await prisma.eventCollaborator.create({ data: { eventId, userId: users.checker, permissions: [EventPermission.CHECK_IN] } });
  });

  afterAll(async () => {
    identity.id = "";
    await prisma.outboxMessage.deleteMany({ where: { kind: "event-invite", payload: { path: ["to"], equals: `guest-${suffix}@example.test` } } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
    await prisma.$disconnect();
  });

  it("lets a co-organiser granted attendee invites add and remove invites", async () => {
    asUser(users.inviter);
    expect(await addEventInvite({ organisationSlug, eventId, email: `Guest-${suffix}@example.test` })).toEqual({ ok: true });
    const invite = await prisma.eventInvite.findFirstOrThrow({ where: { eventId } });
    expect(invite.email).toBe(`guest-${suffix}@example.test`);
    expect(await removeEventInvite({ organisationSlug, eventId, inviteId: invite.id })).toEqual({ ok: true });
  });

  it("refuses co-organisers without the grant and read-only members", async () => {
    for (const id of [users.checker, users.member]) {
      asUser(id);
      expect(await addEventInvite({ organisationSlug, eventId, email: `other-${suffix}@example.test` })).toMatchObject({ ok: false });
    }
    expect(await prisma.eventInvite.count({ where: { eventId } })).toBe(0);
  });
});
