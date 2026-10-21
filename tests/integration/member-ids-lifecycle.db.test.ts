import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: async () => true, getClientIpFromHeaders: () => "203.0.113.1" }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { commitIdImport, createIdProgramme, deleteIdMember, deleteIdProgramme, saveIdProgrammeDesign, setIdMemberStatus, uploadIdProgrammeWatermark } from "@/app/actions/member-ids";
import { prisma } from "@/lib/db";
import { IMPORT_MAX_ROWS } from "@/lib/memberIds/importRows";
import { memberIdsFixture } from "./helpers/memberIds";

// Numbering races, bulk imports, deletion, auditing and the database invariant.
const { suffix, ids, slugA, slugB, as, setUp, tearDown, createProgrammes, openJoinAndClose } = memberIdsFixture(identity);

describe.sequential("member IDs", { timeout: 90_000 }, () => {
  beforeAll(async () => {
    await setUp();
    await createProgrammes();
    await openJoinAndClose(false);
  }, 60_000);

  afterAll(tearDown, 60_000);

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

  it("deletes the stored watermark image when it is removed", async () => {
    as(ids.owner);
    const watermarkKey = `organisations/${ids.orgA}/member-id-watermarks/${randomUUID()}.webp`;
    await prisma.asset.create({ data: { key: watermarkKey, contentType: "image/webp", provider: "database", fileData: new Uint8Array([1]), organisationId: ids.orgA } });
    await prisma.idProgramme.update({ where: { id: ids.programmeA }, data: { watermarkUrl: `/api/uploads/${watermarkKey}` } });
    const form = new FormData();
    form.set("organisationSlug", slugA);
    form.set("programmeId", ids.programmeA);
    form.set("remove", "1");
    expect(await uploadIdProgrammeWatermark(form)).toEqual({ ok: true, data: { url: null } });
    expect(await prisma.asset.count({ where: { key: watermarkKey } })).toBe(0);
  });

  it("keeps every member inside its programme's organisation at the database layer", async () => {
    await expect(prisma.idMember.create({
      data: { programmeId: ids.programmeA, organisationId: ids.orgB, name: "Misplaced", email: `misplaced-${suffix}@example.test`, source: "MANUAL", verifyToken: randomBytes(16).toString("base64url") },
    })).rejects.toThrow();
  });
});
