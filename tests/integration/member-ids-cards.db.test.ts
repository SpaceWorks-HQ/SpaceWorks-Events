import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: async () => true, getClientIpFromHeaders: () => "203.0.113.1" }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { commitIdImport, emailIdCard, emailIdCards, setIdMemberStatus } from "@/app/actions/member-ids";
import { prisma } from "@/lib/db";
import { readZip } from "@/lib/memberIds/zip";
import { lookupVerification } from "@/lib/memberIds/verifyLookup";
import { memberIdsFixture } from "./helpers/memberIds";

// Import, approval, cards, verification and email, starting from programmes as member-ids.db.test.ts leaves them.
const { suffix, ids, slugA, slugB, as, one, bulk, wallet, setUp, tearDown, createProgrammes, openJoinAndClose } = memberIdsFixture(identity);

describe.sequential("member IDs", { timeout: 90_000 }, () => {
  beforeAll(async () => {
    await setUp();
    await createProgrammes();
    await openJoinAndClose(true);
  }, 60_000);

  afterAll(tearDown, 60_000);

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
});
