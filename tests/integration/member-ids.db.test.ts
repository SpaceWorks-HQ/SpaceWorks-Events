import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: async () => true, getClientIpFromHeaders: () => "203.0.113.1" }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { joinIdProgramme } from "@/app/actions/member-id-join";
import { createIdProgramme, deleteIdProgramme, saveIdProgrammeDesign, saveIdProgrammeFields, updateIdProgramme } from "@/app/actions/member-ids";
import { prisma } from "@/lib/db";
import { lookupVerification } from "@/lib/memberIds/verifyLookup";
import { memberIdsFixture } from "./helpers/memberIds";

// Programmes and joining. Cards and email are in member-ids-cards, deletion and auditing in member-ids-lifecycle.
const { suffix, ids, slugA, slugB, as, joinForm, setUp, tearDown } = memberIdsFixture(identity);

describe.sequential("member IDs", { timeout: 90_000 }, () => {
  beforeAll(setUp, 60_000);

  afterAll(tearDown, 60_000);

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
});
