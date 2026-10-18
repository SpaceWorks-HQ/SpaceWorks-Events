import { randomBytes, randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MembershipRole } from "@prisma/client";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: async () => true, getClientIpFromHeaders: () => "203.0.113.1" }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { joinIdProgramme } from "@/app/actions/member-id-join";
import { commitIdImport, createIdProgramme, deleteIdMember, deleteIdProgramme, emailIdCard, emailIdCards, saveIdProgrammeDesign, saveIdProgrammeFields, setIdMemberStatus, updateIdProgramme, uploadIdProgrammeWatermark } from "@/app/actions/member-ids";
import { GET as bulkCards } from "@/app/api/exports/member-ids/[programmeId]/cards/route";
import { GET as oneCard } from "@/app/api/exports/member-ids/[programmeId]/cards/[memberId]/route";
import { GET as walletCard } from "@/app/api/exports/account/ids/[memberId]/route";
import { prisma } from "@/lib/db";
import { IMPORT_MAX_ROWS } from "@/lib/memberIds/importRows";
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

  it("returns the saved question keys so a second save keeps them", async () => {
    as(ids.owner);
    const created = await createIdProgramme({ organisationSlug: slugA, name: "Question keys" });
    const id = created.ok ? created.data!.id : "";
    const question = { label: "Joined on", type: "DATE" as const, required: false, options: [], placement: "BACK" as const };
    const first = await saveIdProgrammeFields({ organisationSlug: slugA, programmeId: id, fields: [question] });
    expect(first).toEqual({ ok: true, data: { keys: ["joined_on"] } });
    // The designer sends the returned key back with an edited label.
    const second = await saveIdProgrammeFields({ organisationSlug: slugA, programmeId: id, fields: [{ ...question, key: "joined_on", label: "Member since" }] });
    expect(second).toEqual({ ok: true, data: { keys: ["joined_on"] } });
    expect(await prisma.idProgrammeField.findMany({ where: { programmeId: id }, select: { key: true, label: true } })).toEqual([{ key: "joined_on", label: "Member since" }]);
    await deleteIdProgramme({ organisationSlug: slugA, programmeId: id });
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
    expect(result).toEqual({ ok: true, data: { count: 2, skippedRecent: 0, skippedLimit: 0 } });
    const messages = await prisma.outboxMessage.findMany({ where: { kind: "member-id-card", payload: { path: ["to"], string_ends_with: `${suffix}@example.test` } } });
    expect(messages).toHaveLength(2);
    const tokens = (await prisma.idMember.findMany({ where: { programmeId: ids.programmeA }, select: { verifyToken: true } })).map((row) => row.verifyToken);
    for (const message of messages) for (const token of tokens) expect(JSON.stringify(message.payload)).not.toContain(token);
    as(ids.member);
    expect((await emailIdCards({ organisationSlug: slugA, programmeId: ids.programmeA })).ok).toBe(false);
  });

  it("emails each member at most once a day, bulk-mails imports only once, and caps the organisation's day", async () => {
    as(ids.owner);
    const input = { organisationSlug: slugA, programmeId: ids.programmeA };
    const asha = await prisma.idMember.findFirstOrThrow({ where: { programmeId: ids.programmeA, email: `asha-${suffix}@example.test` } });
    const ben = await prisma.idMember.findFirstOrThrow({ where: { programmeId: ids.programmeA, email: `ben-${suffix}@example.test` } });
    const joiner = await prisma.idMember.findFirstOrThrow({ where: { programmeId: ids.programmeA, userId: ids.joiner } });
    const queued = () => prisma.outboxMessage.count({ where: { kind: "member-id-card", payload: { path: ["to"], string_ends_with: `${suffix}@example.test` } } });
    const before = await queued();

    // Just emailed: neither a bulk send nor an explicit one goes out again.
    expect(await emailIdCards(input)).toMatchObject({ ok: false, error: expect.stringContaining("already emailed") });
    expect((await emailIdCard({ ...input, memberId: asha.id })).ok).toBe(false);

    // A day later, imported members are still left out of bulk sends; a self-joined member is included.
    const dayAgo = new Date(Date.now() - 25 * 3_600_000);
    await prisma.idMember.updateMany({ where: { id: { in: [asha.id, ben.id] } }, data: { lastEmailedAt: dayAgo } });
    await setIdMemberStatus({ ...input, memberIds: [joiner.id], action: "reinstate" });
    expect(await emailIdCards(input)).toEqual({ ok: true, data: { count: 1, skippedRecent: 2, skippedLimit: 0 } });
    expect((await prisma.idMember.findUniqueOrThrow({ where: { id: joiner.id } })).lastEmailedAt).not.toBeNull();
    await prisma.idMember.update({ where: { id: joiner.id }, data: { lastEmailedAt: dayAgo } });
    expect(await emailIdCards(input)).toEqual({ ok: true, data: { count: 1, skippedRecent: 2, skippedLimit: 0 } });

    // An owner can still resend one imported member's card explicitly.
    expect(await emailIdCard({ ...input, memberId: asha.id })).toEqual({ ok: true, data: { count: 1, skippedRecent: 0, skippedLimit: 0 } });
    expect(await queued()).toBe(before + 3);

    // The organisation is under a week old: 50 a day. Use up the rest and the next send is held back.
    const sent = await prisma.auditEvent.findMany({ where: { organisationId: ids.orgA, action: "ID_CARDS_EMAILED" }, select: { metadata: true } });
    const used = sent.reduce((sum, row) => sum + Number((row.metadata as { count: number }).count), 0);
    expect(used).toBe(5);
    const filler = await prisma.auditEvent.create({ data: { action: "ID_CARDS_EMAILED", organisationId: ids.orgA, targetType: "IdProgramme", targetId: ids.programmeA, metadata: { count: 50 - used } } });
    try {
      expect(await emailIdCard({ ...input, memberId: ben.id })).toMatchObject({ ok: false, error: expect.stringContaining("today's limit") });
      expect(await queued()).toBe(before + 3);
    } finally {
      await prisma.auditEvent.delete({ where: { id: filler.id } });
    }

    as(ids.member);
    expect((await emailIdCard({ ...input, memberId: ben.id })).ok).toBe(false);
    as(ids.outsider);
    expect((await emailIdCard({ organisationSlug: slugB, programmeId: ids.programmeB, memberId: ben.id })).ok).toBe(false);
  });

  it("never renumbers a card when two approvals race", async () => {
    as(ids.admin);
    const year = new Date().getUTCFullYear();
    const pending = await Promise.all([1, 2, 3, 4].map((n) => prisma.idMember.create({
      data: { programmeId: ids.programmeA, organisationId: ids.orgA, name: `Racer ${n}`, email: `racer-${n}-${suffix}@example.test`, source: "MANUAL", verifyToken: randomBytes(16).toString("base64url") },
    })));
    const memberIds = pending.map((member) => member.id);
    const { nextSequence } = await prisma.idProgramme.findUniqueOrThrow({ where: { id: ids.programmeA } });
    const input = { organisationSlug: slugA, programmeId: ids.programmeA, memberIds, action: "approve" as const };
    const results = await Promise.all([setIdMemberStatus(input), setIdMemberStatus(input)]);
    expect(results.map((result) => (result.ok ? result.data!.count : -1)).sort()).toEqual([0, 4]);
    const issued = await prisma.idMember.findMany({ where: { id: { in: memberIds } }, select: { idNumber: true, status: true } });
    expect(issued.every((member) => member.status === "APPROVED")).toBe(true);
    expect(issued.map((member) => member.idNumber).sort()).toEqual([0, 1, 2, 3].map((n) => `SWK-${year}-${String(nextSequence + n).padStart(4, "0")}`));
    expect((await prisma.idProgramme.findUniqueOrThrow({ where: { id: ids.programmeA } })).nextSequence).toBe(nextSequence + 4);

    // Approving again leaves the issued numbers alone.
    expect(await setIdMemberStatus(input)).toEqual({ ok: true, data: { count: 0 } });
    const again = await prisma.idMember.findMany({ where: { id: { in: memberIds } }, select: { idNumber: true } });
    expect(again.map((member) => member.idNumber).sort()).toEqual(issued.map((member) => member.idNumber).sort());
    await prisma.idMember.deleteMany({ where: { id: { in: memberIds } } });
  });

  it("imports and approves a full sheet in one go, numbered in row order", async () => {
    as(ids.outsider);
    const rows = Array.from({ length: IMPORT_MAX_ROWS }, (_, index) => [`Bulk ${index}`, `bulk-${index}-${suffix}@example.test`]);
    const result = await commitIdImport({ organisationSlug: slugB, programmeId: ids.programmeB, headers: ["Name", "Email"], rows, mapping: ["name", "email"], approve: true });
    expect(result).toMatchObject({ ok: true, data: { created: IMPORT_MAX_ROWS, approved: IMPORT_MAX_ROWS } });
    const programme = await prisma.idProgramme.findUniqueOrThrow({ where: { id: ids.programmeB } });
    const year = new Date().getUTCFullYear();
    for (const index of [0, 1, 999, IMPORT_MAX_ROWS - 1]) {
      const member = await prisma.idMember.findFirstOrThrow({ where: { programmeId: ids.programmeB, email: `bulk-${index}-${suffix}@example.test` } });
      expect(member.idNumber).toBe(`${programme.idPrefix}-${year}-${String(index + 1).padStart(4, "0")}`);
    }
    expect(await prisma.idMember.count({ where: { programmeId: ids.programmeB, status: "APPROVED" } })).toBe(IMPORT_MAX_ROWS);
  }, 120_000);

  it("deletes a member with their photo, audited, for owners and admins only", async () => {
    const key = `organisations/${ids.orgA}/member-id-photos/${randomUUID()}.webp`;
    await prisma.asset.create({ data: { key, contentType: "image/webp", provider: "database", fileData: new Uint8Array([1, 2, 3]), organisationId: ids.orgA } });
    const member = await prisma.idMember.create({
      data: { programmeId: ids.programmeA, organisationId: ids.orgA, name: "Leaver", email: `leaver-${suffix}@example.test`, photoUrl: `/api/uploads/${key}`, source: "MANUAL", verifyToken: randomBytes(16).toString("base64url") },
    });
    const input = { organisationSlug: slugA, programmeId: ids.programmeA, memberId: member.id };
    as(ids.member);
    expect((await deleteIdMember(input)).ok).toBe(false);
    as(ids.outsider);
    expect((await deleteIdMember({ ...input, organisationSlug: slugB, programmeId: ids.programmeB })).ok).toBe(false);
    expect(await prisma.idMember.count({ where: { id: member.id } })).toBe(1);

    as(ids.admin);
    expect(await deleteIdMember(input)).toEqual({ ok: true });
    expect(await prisma.idMember.count({ where: { id: member.id } })).toBe(0);
    expect(await prisma.asset.count({ where: { key } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: "ID_MEMBER_DELETED", targetId: member.id, organisationId: ids.orgA } })).toBe(1);
  });

  it("removes members' photos and the watermark when a programme is deleted", async () => {
    as(ids.owner);
    const created = await createIdProgramme({ organisationSlug: slugA, name: "Short-lived" });
    const programmeId = created.ok ? created.data!.id : "";
    const photoKey = `organisations/${ids.orgA}/member-id-photos/${randomUUID()}.webp`;
    const watermarkKey = `organisations/${ids.orgA}/member-id-watermarks/${randomUUID()}.webp`;
    const otherOrgKey = `organisations/${ids.orgB}/member-id-photos/${randomUUID()}.webp`;
    for (const [key, organisationId] of [[photoKey, ids.orgA], [watermarkKey, ids.orgA], [otherOrgKey, ids.orgB]] as const) {
      await prisma.asset.create({ data: { key, contentType: "image/webp", provider: "database", fileData: new Uint8Array([1]), organisationId } });
    }
    await prisma.idProgramme.update({ where: { id: programmeId }, data: { watermarkUrl: `/api/uploads/${watermarkKey}` } });
    await prisma.idMember.createMany({ data: [
      { programmeId, organisationId: ids.orgA, name: "Pictured", email: `pictured-${suffix}@example.test`, photoUrl: `/api/uploads/${photoKey}`, source: "MANUAL", verifyToken: randomBytes(16).toString("base64url") },
      // A photo URL pointing at another organisation's upload is never deleted.
      { programmeId, organisationId: ids.orgA, name: "Foreign", email: `foreign-${suffix}@example.test`, photoUrl: `/api/uploads/${otherOrgKey}`, source: "MANUAL", verifyToken: randomBytes(16).toString("base64url") },
    ] });

    expect(await deleteIdProgramme({ organisationSlug: slugA, programmeId })).toEqual({ ok: true });
    expect(await prisma.idMember.count({ where: { programmeId } })).toBe(0);
    expect(await prisma.asset.count({ where: { key: { in: [photoKey, watermarkKey] } } })).toBe(0);
    expect(await prisma.asset.count({ where: { key: otherOrgKey } })).toBe(1);
  });

  it("audits design saves at most once per ten minutes and every watermark change", async () => {
    as(ids.owner);
    const input = { organisationSlug: slugA, programmeId: ids.programmeA, design: { preset: "event" } };
    expect((await saveIdProgrammeDesign(input)).ok).toBe(true);
    expect((await saveIdProgrammeDesign(input)).ok).toBe(true);
    expect(await prisma.auditEvent.count({ where: { action: "ID_PROGRAMME_DESIGN_UPDATED", targetId: ids.programmeA, actorUserId: ids.owner } })).toBe(1);
    as(ids.admin);
    expect((await saveIdProgrammeDesign(input)).ok).toBe(true);
    expect(await prisma.auditEvent.count({ where: { action: "ID_PROGRAMME_DESIGN_UPDATED", targetId: ids.programmeA } })).toBe(2);

    const form = new FormData();
    form.set("organisationSlug", slugA);
    form.set("programmeId", ids.programmeA);
    form.set("remove", "1");
    expect(await uploadIdProgrammeWatermark(form)).toEqual({ ok: true, data: { url: null } });
    const audit = await prisma.auditEvent.findFirst({ where: { action: "ID_PROGRAMME_WATERMARK_UPDATED", targetId: ids.programmeA } });
    expect(audit).toMatchObject({ actorUserId: ids.admin, organisationId: ids.orgA, metadata: { removed: true } });
  });

  it("keeps every member inside its programme's organisation at the database layer", async () => {
    await expect(prisma.idMember.create({
      data: { programmeId: ids.programmeA, organisationId: ids.orgB, name: "Misplaced", email: `misplaced-${suffix}@example.test`, source: "MANUAL", verifyToken: randomBytes(16).toString("base64url") },
    })).rejects.toThrow();
  });
});
