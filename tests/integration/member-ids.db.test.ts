import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MembershipRole } from "@prisma/client";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: async () => true, getClientIpFromHeaders: () => "203.0.113.1" }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { joinIdProgramme } from "@/app/actions/member-id-join";
import { commitIdImport, createIdProgramme, emailIdCards, saveIdProgrammeDesign, setIdMemberStatus, updateIdProgramme } from "@/app/actions/member-ids";
import { GET as bulkCards } from "@/app/api/exports/member-ids/[programmeId]/cards/route";
import { GET as oneCard } from "@/app/api/exports/member-ids/[programmeId]/cards/[memberId]/route";
import { GET as walletCard } from "@/app/api/exports/account/ids/[memberId]/route";
import { prisma } from "@/lib/db";
import { readZip } from "@/lib/memberIds/zip";
import { lookupVerification } from "@/lib/memberIds/verifyLookup";

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

describe.sequential("member IDs", { timeout: 90_000 }, () => {
  beforeAll(async () => {
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
  }, 60_000);

  afterAll(async () => {
    identity.id = "";
    await prisma.outboxMessage.deleteMany({ where: { kind: "member-id-card", payload: { path: ["to"], string_ends_with: `${suffix}@example.test` } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [ids.orgA, ids.orgB].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.owner, ids.admin, ids.member, ids.outsider, ids.joiner].filter(Boolean) } } });
    await prisma.$disconnect();
  }, 60_000);

  it("lets owners and admins create programmes, but not plain members", async () => {
    as(ids.member);
    expect((await createIdProgramme({ organisationSlug: slugA, name: "Members" })).ok).toBe(false);
    as(ids.outsider);
    expect((await createIdProgramme({ organisationSlug: slugA, name: "Members" })).ok).toBe(false);
    const other = await createIdProgramme({ organisationSlug: slugB, name: "Other members" });
    expect(other.ok).toBe(true);
    ids.programmeB = other.ok ? other.data!.id : "";

    as(ids.admin);
    const created = await createIdProgramme({ organisationSlug: slugA, name: "Community members", preset: "event" });
    expect(created.ok).toBe(true);
    ids.programmeA = created.ok ? created.data!.id : "";
    const row = await prisma.idProgramme.findUniqueOrThrow({ where: { id: ids.programmeA }, include: { fields: true } });
    expect(row).toMatchObject({ organisationId: ids.orgA, idPrefix: "SW", status: "DRAFT", registrationOpen: false });
    expect(row.design).toMatchObject({ preset: "event" });
    const audit = await prisma.auditEvent.findFirst({ where: { action: "ID_PROGRAMME_CREATED", targetId: ids.programmeA } });
    expect(audit?.organisationId).toBe(ids.orgA);
  });

  it("keeps programmes isolated between organisations", async () => {
    as(ids.outsider);
    // Another organisation's programme id under the outsider's own slug, and under the real slug.
    for (const organisationSlug of [slugA, slugB]) {
      const result = await updateIdProgramme({ organisationSlug, programmeId: ids.programmeA, name: "Hijacked", description: "", status: "ACTIVE", registrationOpen: true, requiresApproval: false, idPrefix: "XX", validity: "none" });
      expect(result.ok).toBe(false);
      expect((await saveIdProgrammeDesign({ organisationSlug, programmeId: ids.programmeA, design: { preset: "student" } })).ok).toBe(false);
    }
    expect((await prisma.idProgramme.findUniqueOrThrow({ where: { id: ids.programmeA } })).name).toBe("Community members");
  });

  it("respects the join form's open state", async () => {
    as(ids.joiner);
    const slug = (await prisma.idProgramme.findUniqueOrThrow({ where: { id: ids.programmeA } })).slug;
    expect(await joinIdProgramme(joinForm(slug, { name: "Jo Iner", "field:role": "Volunteer" }))).toMatchObject({ ok: false });

    as(ids.owner);
    const opened = await updateIdProgramme({ organisationSlug: slugA, programmeId: ids.programmeA, name: "Community members", description: "For everyone", status: "ACTIVE", registrationOpen: true, requiresApproval: true, idPrefix: "SWK", validity: "date", validUntil: "2099-12-31" });
    expect(opened.ok).toBe(true);

    as("");
    expect((await joinIdProgramme(joinForm(slug, { name: "Anon" }))).ok).toBe(false);
    as(ids.joiner);
    const joined = await joinIdProgramme(joinForm(slug, { name: "Jo Iner", "field:role": "Volunteer", "field:unknown": "x" }));
    expect(joined).toEqual({ ok: true, data: { status: "PENDING" } });
    expect((await joinIdProgramme(joinForm(slug, { name: "Jo Again" }))).ok).toBe(false);
    const request = await prisma.idMember.findFirstOrThrow({ where: { programmeId: ids.programmeA, userId: ids.joiner } });
    expect(request).toMatchObject({ status: "PENDING", idNumber: null, email: `joiner-${suffix}@example.test`, fieldValues: { role: "Volunteer" } });
    expect(request.verifyToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    // Pending cards don't verify.
    expect(await lookupVerification(request.verifyToken)).toEqual({ state: "not-found" });

    as(ids.owner);
    await updateIdProgramme({ organisationSlug: slugA, programmeId: ids.programmeA, name: "Community members", description: "", status: "ACTIVE", registrationOpen: false, requiresApproval: true, idPrefix: "SWK", validity: "date", validUntil: "2099-12-31" });
    as(ids.joiner);
    await prisma.idMember.delete({ where: { id: request.id } });
    expect((await joinIdProgramme(joinForm(slug, { name: "Jo Iner", "field:role": "Volunteer" }))).ok).toBe(false);
    await prisma.idMember.create({ data: { ...request, fieldValues: { role: "Volunteer" } } });
  });

  it("imports members with de-duplication", async () => {
    as(ids.owner);
    const result = await commitIdImport({
      organisationSlug: slugA,
      programmeId: ids.programmeA,
      headers: ["Name", "Email", "Role"],
      rows: [["Asha", `asha-${suffix}@example.test`, "Lead"], ["Asha twin", `ASHA-${suffix}@example.test`, "Lead"], ["Jo duplicate", `joiner-${suffix}@example.test`, "x"], ["Ben", `ben-${suffix}@example.test`, "Helper"], ["", "x@example.test", ""]],
      mapping: ["name", "email", "field:role"],
      approve: false,
    });
    expect(result).toMatchObject({ ok: true, data: { created: 2, approved: 0, duplicates: 2 } });
    as(ids.outsider);
    expect((await commitIdImport({ organisationSlug: slugB, programmeId: ids.programmeA, headers: ["Name", "Email"], rows: [["Evil", `evil-${suffix}@example.test`]], mapping: ["name", "email"], approve: true })).ok).toBe(false);
    expect(await prisma.idMember.count({ where: { programmeId: ids.programmeA } })).toBe(3);
    const audit = await prisma.auditEvent.findFirst({ where: { action: "ID_MEMBERS_IMPORTED", targetId: ids.programmeA } });
    expect(audit?.metadata).toMatchObject({ created: 2, duplicates: 2 });
  });

  it("only lets owners and admins approve, and issues sequential ID numbers", async () => {
    const members = await prisma.idMember.findMany({ where: { programmeId: ids.programmeA }, orderBy: { createdAt: "asc" } });
    const memberIds = members.map((member) => member.id);
    as(ids.member);
    expect((await setIdMemberStatus({ organisationSlug: slugA, programmeId: ids.programmeA, memberIds, action: "approve" })).ok).toBe(false);
    as(ids.outsider);
    // Org A's member ids sent through the outsider's own programme touch nothing.
    expect(await setIdMemberStatus({ organisationSlug: slugB, programmeId: ids.programmeB, memberIds, action: "approve" })).toEqual({ ok: true, data: { count: 0 } });
    expect(await prisma.idMember.count({ where: { programmeId: ids.programmeA, status: "APPROVED" } })).toBe(0);

    as(ids.admin);
    const approved = await setIdMemberStatus({ organisationSlug: slugA, programmeId: ids.programmeA, memberIds, action: "approve" });
    expect(approved).toEqual({ ok: true, data: { count: 3 } });
    const issued = await prisma.idMember.findMany({ where: { programmeId: ids.programmeA }, orderBy: { idNumber: "asc" } });
    const year = new Date().getUTCFullYear();
    expect(issued.map((member) => member.idNumber)).toEqual([`SWK-${year}-0001`, `SWK-${year}-0002`, `SWK-${year}-0003`]);
    expect(issued.every((member) => member.expiresAt?.toISOString() === "2099-12-31T23:59:59.000Z")).toBe(true);
    expect(await prisma.auditEvent.count({ where: { action: "ID_MEMBERS_APPROVED", targetId: ids.programmeA } })).toBe(1);
  });

  it("serves cards only to the programme's own owners and admins", async () => {
    const member = await prisma.idMember.findFirstOrThrow({ where: { programmeId: ids.programmeA, userId: ids.joiner } });
    as(ids.outsider);
    expect((await one(ids.programmeA, member.id)).status).toBe(404);
    expect((await bulk(ids.programmeA)).status).toBe(404);
    as(ids.member);
    expect((await one(ids.programmeA, member.id)).status).toBe(404);
    as(ids.owner);
    // A member id from another programme is not found under this one.
    expect((await one(ids.programmeB, member.id)).status).toBe(404);

    const pdf = await one(ids.programmeA, member.id);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("cache-control")).toContain("no-store");
    expect((await PDFDocument.load(new Uint8Array(await pdf.arrayBuffer()))).getPageCount()).toBe(2);
    const png = await one(ids.programmeA, member.id, "png");
    expect(png.headers.get("content-type")).toBe("image/png");

    const zip = await bulk(ids.programmeA, "zip");
    expect(zip.status).toBe(200);
    expect(readZip(Buffer.from(await zip.arrayBuffer()))).toHaveLength(3);
    expect(await prisma.auditEvent.count({ where: { action: "ID_CARDS_EXPORTED", targetId: ids.programmeA } })).toBe(1);
  });

  it("shows the card in the member's wallet and nobody else's", async () => {
    const member = await prisma.idMember.findFirstOrThrow({ where: { programmeId: ids.programmeA, userId: ids.joiner } });
    as(ids.joiner);
    expect((await wallet(member.id)).status).toBe(200);
    as(ids.owner);
    expect((await wallet(member.id)).status).toBe(404);
  });

  it("verifies valid cards and reveals nothing for revoked or unknown ones", async () => {
    const member = await prisma.idMember.findFirstOrThrow({ where: { programmeId: ids.programmeA, userId: ids.joiner } });
    expect(await lookupVerification(member.verifyToken)).toMatchObject({ state: "valid", name: "Jo Iner", idNumber: member.idNumber, organisationName: "Space Works", validUntil: "31 Dec 2099" });
    expect(await lookupVerification(member.verifyToken, new Date("2100-06-01T00:00:00Z"))).toMatchObject({ state: "expired" });

    as(ids.owner);
    const revoked = await setIdMemberStatus({ organisationSlug: slugA, programmeId: ids.programmeA, memberIds: [member.id], action: "revoke", reason: "Left the community" });
    expect(revoked).toEqual({ ok: true, data: { count: 1 } });
    const view = await lookupVerification(member.verifyToken);
    expect(view).toEqual({ state: "revoked" });
    expect(JSON.stringify(view)).not.toContain("Left the community");
    expect(await lookupVerification("A".repeat(22))).toEqual({ state: "not-found" });
    expect(await lookupVerification("../../etc")).toEqual({ state: "not-found" });
    as(ids.joiner);
    expect((await wallet(member.id)).status).toBe(404);
  });

  it("queues card emails through the outbox without storing the verify token", async () => {
    as(ids.owner);
    const result = await emailIdCards({ organisationSlug: slugA, programmeId: ids.programmeA });
    expect(result).toEqual({ ok: true, data: { count: 2 } });
    const messages = await prisma.outboxMessage.findMany({ where: { kind: "member-id-card", payload: { path: ["to"], string_ends_with: `${suffix}@example.test` } } });
    expect(messages).toHaveLength(2);
    const tokens = (await prisma.idMember.findMany({ where: { programmeId: ids.programmeA }, select: { verifyToken: true } })).map((row) => row.verifyToken);
    for (const message of messages) for (const token of tokens) expect(JSON.stringify(message.payload)).not.toContain(token);
    as(ids.member);
    expect((await emailIdCards({ organisationSlug: slugA, programmeId: ids.programmeA })).ok).toBe(false);
  });
});
