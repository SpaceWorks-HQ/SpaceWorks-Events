import { randomUUID } from "node:crypto";
import { MembershipRole } from "@prisma/client";
import { joinIdProgramme } from "@/app/actions/member-id-join";
import { createIdProgramme, updateIdProgramme } from "@/app/actions/member-ids";
import { GET as bulkCards } from "@/app/api/exports/member-ids/[programmeId]/cards/route";
import { GET as oneCard } from "@/app/api/exports/member-ids/[programmeId]/cards/[memberId]/route";
import { GET as walletCard } from "@/app/api/exports/account/ids/[memberId]/route";
import { prisma } from "@/lib/db";

/*
 * Shared fixture for the member-ID integration suites. Each test file passes
 * in the identity object its `@/lib/auth` mock reads, gets its own suffix
 * (so its own organisations and users), and cleans up after itself.
 */
export function memberIdsFixture(identity: { id: string }) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const ids = { orgA: "", orgB: "", owner: "", admin: "", member: "", outsider: "", joiner: "", programmeA: "", programmeB: "", memberB: "" };
  const slugA = `ids-a-${suffix}`;
  const slugB = `ids-b-${suffix}`;

  const as = (userId: string) => {
    identity.id = userId;
  };
  const one = (programmeId: string, memberId: string, format = "pdf") =>
    oneCard(new Request(`https://events.example.test/api/exports/member-ids/${programmeId}/cards/${memberId}?format=${format}`), { params: Promise.resolve({ programmeId, memberId }) });
  const bulk = (programmeId: string, format = "pdf") =>
    bulkCards(new Request(`https://events.example.test/api/exports/member-ids/${programmeId}/cards?format=${format}`), { params: Promise.resolve({ programmeId }) });
  const wallet = (memberId: string) =>
    walletCard(new Request(`https://events.example.test/api/exports/account/ids/${memberId}?format=pdf`), { params: Promise.resolve({ memberId }) });

  function joinForm(programmeSlug: string, values: Record<string, string>) {
    const data = new FormData();
    data.set("organisationSlug", slugA);
    data.set("programmeSlug", programmeSlug);
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  }

  /** Users and the two organisations: owner, admin and member in A; the outsider owns B. */
  async function setUp() {
    const user = (name: string, verified = false) => prisma.user.create({ data: { name, email: `${name}-${suffix}@example.test`, emailVerified: verified ? new Date() : null } });
    const [owner, admin, member, outsider, joiner] = await Promise.all([user("owner"), user("admin"), user("member"), user("outsider"), user("joiner", true)]);
    Object.assign(ids, { owner: owner.id, admin: admin.id, member: member.id, outsider: outsider.id, joiner: joiner.id });
    const orgA = await prisma.organisation.create({ data: { name: "Space Works", slug: slugA } });
    const orgB = await prisma.organisation.create({ data: { name: "Other Org", slug: slugB } });
    Object.assign(ids, { orgA: orgA.id, orgB: orgB.id });
    await prisma.membership.createMany({ data: [
      { userId: owner.id, organisationId: orgA.id, role: MembershipRole.OWNER },
      { userId: admin.id, organisationId: orgA.id, role: MembershipRole.ADMIN },
      { userId: member.id, organisationId: orgA.id, role: MembershipRole.MEMBER },
      { userId: outsider.id, organisationId: orgB.id, role: MembershipRole.OWNER },
    ] });
  }

  async function tearDown() {
    identity.id = "";
    await prisma.outboxMessage.deleteMany({ where: { kind: "member-id-card", payload: { path: ["to"], string_ends_with: `${suffix}@example.test` } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [ids.orgA, ids.orgB].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.owner, ids.admin, ids.member, ids.outsider, ids.joiner].filter(Boolean) } } });
    await prisma.$disconnect();
  }

  const required = <T extends { ok: boolean }>(result: T, step: string) => {
    if (!result.ok) throw new Error(`Member-ID fixture step failed: ${step}`);
    return result;
  };

  /**
   * The programmes as the "programmes and joining" tests leave them: B owned by
   * the outsider; A created by the admin with the event preset, then active,
   * approval-required and closed, SWK-prefixed and valid until 2099-12-31.
   */
  async function createProgrammes() {
    as(ids.outsider);
    const other = required(await createIdProgramme({ organisationSlug: slugB, name: "Other members" }), "create programme B");
    ids.programmeB = other.ok ? other.data!.id : "";
    as(ids.admin);
    const created = required(await createIdProgramme({ organisationSlug: slugA, name: "Community members", preset: "event" }), "create programme A");
    ids.programmeA = created.ok ? created.data!.id : "";
  }

  const settings = (registrationOpen: boolean, description: string) => ({ organisationSlug: slugA, programmeId: ids.programmeA, name: "Community members", description, status: "ACTIVE" as const, registrationOpen, requiresApproval: true, idPrefix: "SWK", validity: "date" as const, validUntil: "2099-12-31" });

  /** Opens programme A, lets the joiner ask to join (pending), then closes it again. */
  async function openJoinAndClose(withJoiner: boolean) {
    as(ids.owner);
    required(await updateIdProgramme(settings(true, "For everyone")), "open programme A");
    if (withJoiner) {
      const slug = (await prisma.idProgramme.findUniqueOrThrow({ where: { id: ids.programmeA } })).slug;
      as(ids.joiner);
      required(await joinIdProgramme(joinForm(slug, { name: "Jo Iner", "field:role": "Volunteer" })), "join programme A");
      as(ids.owner);
    }
    required(await updateIdProgramme(settings(false, "")), "close programme A");
  }

  return { suffix, ids, slugA, slugB, as, one, bulk, wallet, joinForm, setUp, tearDown, createProgrammes, openJoinAndClose };
}
