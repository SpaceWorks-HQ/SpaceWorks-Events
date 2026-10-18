"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent, recordThrottledAuditEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  computeExpiry,
  deriveIdPrefix,
  fieldKeyFor,
  ID_PREFIX_PATTERN,
  isEmail,
  MAX_FIELD_OPTIONS,
  MAX_PROGRAMME_FIELDS,
  MEMBER_NAME_MAX,
  parseDateInput,
  validateFieldValues,
} from "@/lib/memberIds/core";
import { memberIdsAccess, type MemberIdsAccess } from "@/lib/memberIds/access";
import { loadProgramme, newVerifyToken } from "@/lib/memberIds/data";
import { defaultMemberIdDesign, MEMBER_ID_DESIGN_MAX_BYTES, MEMBER_ID_PRESETS, normalizeMemberIdDesign } from "@/lib/memberIds/design";
import { queueMemberIdCardEmails, type MemberIdEmailQueueResult } from "@/lib/memberIds/email";
import { IMPORT_CELL_MAX, IMPORT_MAX_BYTES, IMPORT_MAX_COLUMNS, IMPORT_MAX_ROWS, autoMap, parseCsv, planImport, toImportTable, type ImportTarget } from "@/lib/memberIds/importRows";
import { approveMembers } from "@/lib/memberIds/issue";
import { fetchGoogleSheetCsv, SheetFetchError } from "@/lib/memberIds/sheets";
import { removeMemberIdImages, storeMemberIdImage } from "@/lib/memberIds/uploads";
import { slugifyTitle } from "@/lib/slug";
import type { ActionResult } from "./org";

/*
 * Organiser actions for member IDs. Each one: signs in, rate-limits, checks
 * the caller is an OWNER or ADMIN of the organisation in the request, then
 * reads and writes only rows scoped to that organisation's id.
 */

const NOT_FOUND = "That ID programme wasn't found.";
const MAX_BULK = 500;
const DESIGN_AUDIT_WINDOW_MS = 10 * 60_000;

const orgInput = z.object({ organisationSlug: z.string().trim().min(1).max(120) });
const programmeInput = orgInput.extend({ programmeId: z.string().trim().min(1).max(128) });
const idList = z.array(z.string().trim().min(1).max(128)).min(1).max(MAX_BULK);

type Manage = { ok: true; access: MemberIdsAccess } | { ok: false; error: string };

async function requireManage(organisationSlug: string, bucket: "action" | "upload" | "broadcast" = "action"): Promise<Manage> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (await isActionRateLimited(bucket, userId)) return { ok: false, error: "Too many requests. Please try again shortly." };
  const access = await memberIdsAccess(userId, organisationSlug);
  if (!access) return { ok: false, error: NOT_FOUND };
  if (!access.canManage) return { ok: false, error: "Only organisation owners and admins can manage member IDs." };
  return { ok: true, access };
}

async function requireProgramme(organisationSlug: string, programmeId: string, bucket?: "action" | "upload" | "broadcast") {
  const manage = await requireManage(organisationSlug, bucket);
  if (!manage.ok) return manage;
  const programme = await loadProgramme(manage.access.organisation.id, programmeId);
  if (!programme) return { ok: false as const, error: NOT_FOUND };
  return { ok: true as const, access: manage.access, programme };
}

function revalidate(access: MemberIdsAccess, programmeId?: string) {
  revalidatePath(`/dashboard/${access.organisation.slug}/ids`);
  if (programmeId) revalidatePath(`/dashboard/${access.organisation.slug}/ids/${programmeId}`);
}

async function uniqueSlug(organisationId: string, name: string, excludeId?: string) {
  const base = slugifyTitle(name).slice(0, 60) || "ids";
  for (let n = 0; n < 50; n += 1) {
    const slug = n === 0 ? base : `${base}-${n + 1}`;
    const clash = await prisma.idProgramme.findFirst({ where: { organisationId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
    if (!clash) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// --- Programmes --------------------------------------------------------------

const createInput = orgInput.extend({ name: z.string().trim().min(2).max(80), preset: z.enum(MEMBER_ID_PRESETS).optional() }).strict();

export async function createIdProgramme(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the programme a name of 2 to 80 characters." };
  const manage = await requireManage(parsed.data.organisationSlug);
  if (!manage.ok) return manage;
  const { access } = manage;
  const context = { programmeName: parsed.data.name, organisationName: access.organisation.name };
  const programme = await prisma.idProgramme.create({
    data: {
      organisationId: access.organisation.id,
      name: parsed.data.name,
      slug: await uniqueSlug(access.organisation.id, parsed.data.name),
      idPrefix: deriveIdPrefix(access.organisation.name),
      validityDays: 365,
      design: defaultMemberIdDesign(context, parsed.data.preset) as unknown as Prisma.InputJsonValue,
      fields: { create: [{ key: "role", label: "Role", type: "TEXT", placement: "FRONT", sortOrder: 0 }] },
    },
    select: { id: true },
  });
  await recordAuditEvent({ action: "ID_PROGRAMME_CREATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "IdProgramme", targetId: programme.id });
  revalidate(access);
  return { ok: true, data: { id: programme.id } };
}

const detailsInput = programmeInput.extend({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]),
  registrationOpen: z.boolean(),
  requiresApproval: z.boolean(),
  idPrefix: z.string().trim().toUpperCase().regex(ID_PREFIX_PATTERN),
  validity: z.enum(["none", "date", "days"]),
  validUntil: z.string().trim().max(10).optional(),
  validityDays: z.number().int().min(1).max(3650).optional(),
}).strict();

export async function updateIdProgramme(input: unknown): Promise<ActionResult> {
  const parsed = detailsInput.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "idPrefix") return { ok: false, error: "The ID prefix needs 2 to 6 capital letters or digits." };
    if (field === "validityDays") return { ok: false, error: "Cards can last from 1 to 3650 days." };
    return { ok: false, error: "Check the programme details and try again." };
  }
  const data = parsed.data;
  const validUntil = data.validity === "date" ? parseDateInput(data.validUntil ?? "") : null;
  if (data.validity === "date" && !validUntil) return { ok: false, error: "Choose the date cards stop being valid." };
  if (data.validity === "days" && !data.validityDays) return { ok: false, error: "Enter how many days a card lasts." };
  const context = await requireProgramme(data.organisationSlug, data.programmeId);
  if (!context.ok) return context;
  const { access, programme } = context;
  const slug = data.name === programme.name ? programme.slug : await uniqueSlug(access.organisation.id, data.name, programme.id);
  await prisma.idProgramme.update({
    where: { id: programme.id },
    data: {
      name: data.name,
      slug,
      description: data.description,
      status: data.status,
      // Only an active programme takes join requests.
      registrationOpen: data.status === "ACTIVE" && data.registrationOpen,
      requiresApproval: data.requiresApproval,
      idPrefix: data.idPrefix,
      validUntil,
      validityDays: data.validity === "days" ? data.validityDays! : null,
    },
  });
  await recordAuditEvent({ action: "ID_PROGRAMME_UPDATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "IdProgramme", targetId: programme.id, metadata: { status: data.status, registrationOpen: data.status === "ACTIVE" && data.registrationOpen } });
  revalidate(access, programme.id);
  return { ok: true };
}

export async function deleteIdProgramme(input: unknown): Promise<ActionResult> {
  const parsed = programmeInput.strict().safeParse(input);
  if (!parsed.success) return { ok: false, error: NOT_FOUND };
  const context = await requireProgramme(parsed.data.organisationSlug, parsed.data.programmeId);
  if (!context.ok) return context;
  const { access, programme } = context;
  const photos = await prisma.idMember.findMany({ where: { programmeId: programme.id, photoUrl: { not: null } }, select: { photoUrl: true } });
  await prisma.idProgramme.delete({ where: { id: programme.id } });
  await recordAuditEvent({ action: "ID_PROGRAMME_DELETED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "IdProgramme", targetId: programme.id });
  await removeMemberIdImages(access.organisation.id, [programme.watermarkUrl, ...photos.map((member) => member.photoUrl)]);
  revalidate(access);
  return { ok: true };
}

const fieldInput = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{1,48}$/).optional(),
  label: z.string().trim().min(1).max(60),
  type: z.enum(["TEXT", "SELECT", "DATE", "EMAIL", "PHONE"]),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(60)).max(MAX_FIELD_OPTIONS),
  placement: z.enum(["FRONT", "BACK", "HIDDEN"]),
}).strict();

const fieldsInput = programmeInput.extend({ fields: z.array(fieldInput).max(MAX_PROGRAMME_FIELDS) }).strict();

/** Replace the form's custom fields. Existing keys are kept so stored answers still match. */
export async function saveIdProgrammeFields(input: unknown): Promise<ActionResult> {
  const parsed = fieldsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Each question needs a label (up to 60 characters); a form holds up to ${MAX_PROGRAMME_FIELDS}.` };
  const { fields } = parsed.data;
  for (const field of fields) {
    if (field.type === "SELECT" && field.options.length < 2) return { ok: false, error: `Give "${field.label}" at least two options.` };
  }
  const context = await requireProgramme(parsed.data.organisationSlug, parsed.data.programmeId);
  if (!context.ok) return context;
  const { access, programme } = context;
  const existing = new Set(programme.fields.map((field) => field.key));
  const taken = new Set<string>();
  const rows = fields.map((field, index) => {
    const key = field.key && existing.has(field.key) && !taken.has(field.key) ? field.key : fieldKeyFor(field.label, new Set([...taken, ...existing]));
    taken.add(key);
    return { key, label: field.label, type: field.type, required: field.required, options: field.type === "SELECT" ? [...new Set(field.options)] : [], placement: field.placement, sortOrder: index };
  });
  await prisma.$transaction([
    prisma.idProgrammeField.deleteMany({ where: { programmeId: programme.id, key: { notIn: rows.map((row) => row.key) } } }),
    ...rows.map((row) => prisma.idProgrammeField.upsert({
      where: { programmeId_key: { programmeId: programme.id, key: row.key } },
      create: { programmeId: programme.id, ...row },
      update: row,
    })),
  ]);
  await recordAuditEvent({ action: "ID_PROGRAMME_FIELDS_UPDATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "IdProgramme", targetId: programme.id, metadata: { count: rows.length } });
  revalidate(access, programme.id);
  return { ok: true };
}

const designInput = programmeInput.extend({ design: z.record(z.string(), z.unknown()) }).strict();

export async function saveIdProgrammeDesign(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const parsed = designInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That card design couldn't be read." };
  if (Buffer.byteLength(JSON.stringify(parsed.data.design), "utf8") > MEMBER_ID_DESIGN_MAX_BYTES) return { ok: false, error: "That card design is too large to save." };
  const context = await requireProgramme(parsed.data.organisationSlug, parsed.data.programmeId);
  if (!context.ok) return context;
  const { access, programme } = context;
  const design = normalizeMemberIdDesign(parsed.data.design, { programmeName: programme.name, organisationName: access.organisation.name });
  const saved = await prisma.idProgramme.update({ where: { id: programme.id }, data: { design: design as unknown as Prisma.InputJsonValue }, select: { updatedAt: true } });
  // The designer autosaves; one audit row per editing session is enough.
  await recordThrottledAuditEvent({ action: "ID_PROGRAMME_DESIGN_UPDATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "IdProgramme", targetId: programme.id, windowMs: DESIGN_AUDIT_WINDOW_MS });
  return { ok: true, data: { updatedAt: saved.updatedAt.toISOString() } };
}

export async function uploadIdProgrammeWatermark(formData: FormData): Promise<ActionResult<{ url: string | null }>> {
  const organisationSlug = String(formData.get("organisationSlug") ?? "");
  const programmeId = String(formData.get("programmeId") ?? "");
  const context = await requireProgramme(organisationSlug, programmeId, "upload");
  if (!context.ok) return context;
  const { access, programme } = context;
  let url: string | null = null;
  if (formData.get("remove") !== "1") {
    try {
      const stored = await storeMemberIdImage(formData.get("file"), access.organisation.id, "member-id-watermarks");
      if ("error" in stored) return { ok: false, error: stored.error ?? "Could not upload the image." };
      url = stored.url;
    } catch {
      console.error("[member-ids] watermark upload failed");
      return { ok: false, error: "Could not upload the watermark image." };
    }
  }
  await prisma.idProgramme.update({ where: { id: programme.id }, data: { watermarkUrl: url } });
  await recordAuditEvent({ action: "ID_PROGRAMME_WATERMARK_UPDATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "IdProgramme", targetId: programme.id, metadata: { removed: url === null } });
  revalidate(access, programme.id);
  return { ok: true, data: { url } };
}

// --- Members -------------------------------------------------------------

const memberFields = z.object({
  name: z.string().trim().min(1).max(MEMBER_NAME_MAX),
  email: z.string().trim().toLowerCase().max(320),
  values: z.record(z.string().max(48), z.string().max(400)),
});

const addInput = programmeInput.extend(memberFields.shape).extend({ approve: z.boolean() }).strict();

export async function addIdMember(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = addInput.safeParse(input);
  if (!parsed.success || !isEmail(parsed.data.email)) return { ok: false, error: "Enter a name and a valid email address." };
  const context = await requireProgramme(parsed.data.organisationSlug, parsed.data.programmeId);
  if (!context.ok) return context;
  const { access, programme } = context;
  const checked = validateFieldValues(programme.fields, parsed.data.values, { enforceRequired: false });
  if (!checked.ok) return { ok: false, error: checked.error };
  try {
    const member = await prisma.$transaction(async (tx) => {
      const created = await tx.idMember.create({
        data: { programmeId: programme.id, organisationId: access.organisation.id, name: parsed.data.name, email: parsed.data.email, fieldValues: checked.values, source: "MANUAL", verifyToken: newVerifyToken() },
        select: { id: true },
      });
      if (parsed.data.approve) await approveMembers(tx, programme, [created.id]);
      return created;
    });
    await recordAuditEvent({ action: "ID_MEMBER_ADDED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "IdMember", targetId: member.id, metadata: { approved: parsed.data.approve } });
    revalidate(access, programme.id);
    return { ok: true, data: { id: member.id } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "Someone with that email is already in this programme." };
    throw error;
  }
}

const updateMemberInput = programmeInput.extend(memberFields.shape).extend({ memberId: z.string().trim().min(1).max(128) }).strict();

export async function updateIdMember(input: unknown): Promise<ActionResult> {
  const parsed = updateMemberInput.safeParse(input);
  if (!parsed.success || !isEmail(parsed.data.email)) return { ok: false, error: "Enter a name and a valid email address." };
  const context = await requireProgramme(parsed.data.organisationSlug, parsed.data.programmeId);
  if (!context.ok) return context;
  const { access, programme } = context;
  const checked = validateFieldValues(programme.fields, parsed.data.values, { enforceRequired: false });
  if (!checked.ok) return { ok: false, error: checked.error };
  try {
    const updated = await prisma.idMember.updateMany({
      where: { id: parsed.data.memberId, programmeId: programme.id },
      data: { name: parsed.data.name, email: parsed.data.email, fieldValues: checked.values },
    });
    if (updated.count === 0) return { ok: false, error: "That member wasn't found." };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "Someone with that email is already in this programme." };
    throw error;
  }
  await recordAuditEvent({ action: "ID_MEMBER_UPDATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "IdMember", targetId: parsed.data.memberId });
  revalidate(access, programme.id);
  return { ok: true };
}

export async function uploadIdMemberPhoto(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const memberId = String(formData.get("memberId") ?? "");
  const context = await requireProgramme(String(formData.get("organisationSlug") ?? ""), String(formData.get("programmeId") ?? ""), "upload");
  if (!context.ok) return context;
  const { access, programme } = context;
  const member = await prisma.idMember.findFirst({ where: { id: memberId, programmeId: programme.id }, select: { id: true } });
  if (!member) return { ok: false, error: "That member wasn't found." };
  try {
    const stored = await storeMemberIdImage(formData.get("file"), access.organisation.id, "member-id-photos");
    if ("error" in stored) return { ok: false, error: stored.error ?? "Could not upload the photo." };
    await prisma.idMember.update({ where: { id: member.id }, data: { photoUrl: stored.url } });
    await recordAuditEvent({ action: "ID_MEMBER_PHOTO_UPLOADED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "IdMember", targetId: member.id });
    revalidate(access, programme.id);
    return { ok: true, data: { url: stored.url } };
  } catch {
    console.error("[member-ids] member photo upload failed");
    return { ok: false, error: "Could not upload the photo." };
  }
}

const memberInput = programmeInput.extend({ memberId: z.string().trim().min(1).max(128) }).strict();

/** Remove a member and their card for good, with their stored photo. */
export async function deleteIdMember(input: unknown): Promise<ActionResult> {
  const parsed = memberInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That member wasn't found." };
  const context = await requireProgramme(parsed.data.organisationSlug, parsed.data.programmeId);
  if (!context.ok) return context;
  const { access, programme } = context;
  const member = await prisma.idMember.findFirst({ where: { id: parsed.data.memberId, programmeId: programme.id }, select: { id: true, photoUrl: true } });
  if (!member) return { ok: false, error: "That member wasn't found." };
  const { count } = await prisma.idMember.deleteMany({ where: { id: member.id, programmeId: programme.id } });
  if (count === 0) return { ok: false, error: "That member wasn't found." };
  await recordAuditEvent({ action: "ID_MEMBER_DELETED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "IdMember", targetId: member.id });
  await removeMemberIdImages(access.organisation.id, [member.photoUrl]);
  revalidate(access, programme.id);
  return { ok: true };
}

const statusInput = programmeInput.extend({
  memberIds: idList,
  action: z.enum(["approve", "reject", "revoke", "reinstate"]),
  reason: z.string().trim().max(300).optional(),
}).strict();

const STATUS_AUDIT = { approve: "ID_MEMBERS_APPROVED", reject: "ID_MEMBERS_REJECTED", revoke: "ID_MEMBERS_REVOKED", reinstate: "ID_MEMBERS_REINSTATED" } as const;

/** Approve, reject, revoke or reinstate one or more members of this programme. */
export async function setIdMemberStatus(input: unknown): Promise<ActionResult<{ count: number }>> {
  const parsed = statusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose up to 500 members and try again." };
  const { action, memberIds, reason } = parsed.data;
  const context = await requireProgramme(parsed.data.organisationSlug, parsed.data.programmeId);
  if (!context.ok) return context;
  const { access, programme } = context;
  const now = new Date();
  const scope = { id: { in: memberIds }, programmeId: programme.id };
  const count = await prisma.$transaction(async (tx) => {
    if (action === "approve") return approveMembers(tx, programme, memberIds, now);
    if (action === "reject") return (await tx.idMember.updateMany({ where: { ...scope, status: "PENDING" }, data: { status: "REJECTED", statusReason: reason || null } })).count;
    if (action === "revoke") return (await tx.idMember.updateMany({ where: { ...scope, status: "APPROVED" }, data: { status: "REVOKED", revokedAt: now, statusReason: reason || null } })).count;
    return (await tx.idMember.updateMany({ where: { ...scope, status: "REVOKED" }, data: { status: "APPROVED", revokedAt: null, statusReason: null } })).count;
  });
  await recordAuditEvent({ action: STATUS_AUDIT[action], actorUserId: access.userId, organisationId: access.organisation.id, targetType: "IdProgramme", targetId: programme.id, metadata: { count, requested: memberIds.length } });
  revalidate(access, programme.id);
  return { ok: true, data: { count } };
}

const renewInput = programmeInput.extend({ memberIds: idList.optional() }).strict();

/** Restart validity from today, under the programme's current rule, for approved cards. */
export async function renewIdMembers(input: unknown): Promise<ActionResult<{ count: number }>> {
  const parsed = renewInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose up to 500 members and try again." };
  const context = await requireProgramme(parsed.data.organisationSlug, parsed.data.programmeId);
  if (!context.ok) return context;
  const { access, programme } = context;
  const expiresAt = computeExpiry(programme, new Date());
  const { count } = await prisma.idMember.updateMany({
    where: { programmeId: programme.id, status: "APPROVED", ...(parsed.data.memberIds ? { id: { in: parsed.data.memberIds } } : {}) },
    data: { expiresAt },
  });
  await recordAuditEvent({ action: "ID_MEMBERS_RENEWED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "IdProgramme", targetId: programme.id, metadata: { count } });
  revalidate(access, programme.id);
  return { ok: true, data: { count } };
}

const emailInput = programmeInput.extend({ memberIds: idList.optional() }).strict();

export type EmailCardsResult = { count: number; skippedRecent: number; skippedLimit: number };

function emailOutcome(result: MemberIdEmailQueueResult): ActionResult<EmailCardsResult> {
  if (result.matched === 0) return { ok: false, error: "No valid cards to send. Approve members first." };
  if (result.queued === 0) {
    return result.skippedLimit > 0
      ? { ok: false, error: "Your organisation has reached today's limit for ID card emails. Try again tomorrow." }
      : { ok: false, error: "Those cards were already emailed. A card can be emailed again 24 hours after the last send." };
  }
  return { ok: true, data: { count: result.queued, skippedRecent: result.skippedRecent, skippedLimit: result.skippedLimit } };
}

/**
 * Queue "your ID card" emails for valid cards (all of them, or the chosen
 * ones). Only members who joined themselves or were never emailed are
 * included, each at most once a day, within the organisation's daily cap.
 */
export async function emailIdCards(input: unknown): Promise<ActionResult<EmailCardsResult>> {
  const parsed = emailInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose up to 500 members and try again." };
  const context = await requireProgramme(parsed.data.organisationSlug, parsed.data.programmeId, "broadcast");
  if (!context.ok) return context;
  const { access, programme } = context;
  const result = await queueMemberIdCardEmails({ actorUserId: access.userId, organisationId: access.organisation.id, programmeId: programme.id, memberIds: parsed.data.memberIds, explicit: false, take: MAX_BULK });
  return emailOutcome(result);
}

/** Email one member their card, including a resend, at most once a day and within the daily cap. */
export async function emailIdCard(input: unknown): Promise<ActionResult<EmailCardsResult>> {
  const parsed = memberInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That member wasn't found." };
  const context = await requireProgramme(parsed.data.organisationSlug, parsed.data.programmeId, "broadcast");
  if (!context.ok) return context;
  const { access, programme } = context;
  const result = await queueMemberIdCardEmails({ actorUserId: access.userId, organisationId: access.organisation.id, programmeId: programme.id, memberIds: [parsed.data.memberId], explicit: true, take: 1 });
  if (result.matched === 0) return { ok: false, error: "Only approved, valid cards can be emailed." };
  return emailOutcome(result);
}

// --- Import --------------------------------------------------------------

const sourceInput = programmeInput.extend({
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("csv"), text: z.string().max(IMPORT_MAX_BYTES) }).strict(),
    z.object({ kind: z.literal("sheet"), url: z.string().trim().max(500) }).strict(),
  ]),
}).strict();

export type ImportPreview = { headers: string[]; rows: string[][]; mapping: ImportTarget[]; truncated: boolean };

/** Step 1: read a CSV upload or a public Google Sheet into headers and rows, with a suggested mapping. */
export async function readIdImportSource(input: unknown): Promise<ActionResult<ImportPreview>> {
  const parsed = sourceInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a CSV file of up to 2 MB, or paste a Google Sheets link." };
  const context = await requireProgramme(parsed.data.organisationSlug, parsed.data.programmeId, parsed.data.source.kind === "sheet" ? "upload" : "action");
  if (!context.ok) return context;
  let text: string;
  if (parsed.data.source.kind === "csv") text = parsed.data.source.text;
  else {
    try {
      text = await fetchGoogleSheetCsv(parsed.data.source.url);
    } catch (error) {
      return { ok: false, error: error instanceof SheetFetchError ? error.message : "That sheet couldn't be read." };
    }
  }
  const cells = parseCsv(text, IMPORT_MAX_ROWS + 2);
  const table = toImportTable(cells);
  if (table.headers.length === 0 || table.rows.length === 0) return { ok: false, error: "That file has no rows. The first row should hold column names." };
  return { ok: true, data: { headers: table.headers, rows: table.rows, mapping: autoMap(table.headers, context.programme.fields), truncated: cells.length > IMPORT_MAX_ROWS + 1 } };
}

const targetSchema = z.string().max(60).refine((value) => value === "" || value === "name" || value === "email" || /^field:[a-z0-9_]{1,48}$/.test(value));

const commitInput = programmeInput.extend({
  headers: z.array(z.string().max(IMPORT_CELL_MAX)).min(1).max(IMPORT_MAX_COLUMNS),
  rows: z.array(z.array(z.string().max(IMPORT_CELL_MAX)).max(IMPORT_MAX_COLUMNS)).min(1).max(IMPORT_MAX_ROWS),
  mapping: z.array(targetSchema).max(IMPORT_MAX_COLUMNS),
  approve: z.boolean(),
}).strict();

export type ImportResult = { created: number; approved: number; duplicates: number; skipped: Array<{ row: number; reason: string }> };

/** Step 2: create members from the mapped rows. Emails already in the programme are skipped. */
export async function commitIdImport(input: unknown): Promise<ActionResult<ImportResult>> {
  const parsed = commitInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The import couldn't be read. Start again from the file." };
  const { headers, rows, approve } = parsed.data;
  const mapping = parsed.data.mapping as ImportTarget[];
  if (!mapping.includes("name") || !mapping.includes("email")) return { ok: false, error: "Match a column to Name and one to Email." };
  const context = await requireProgramme(parsed.data.organisationSlug, parsed.data.programmeId);
  if (!context.ok) return context;
  const { access, programme } = context;
  const existing = await prisma.idMember.findMany({ where: { programmeId: programme.id }, select: { email: true } });
  const plan = planImport({ headers, rows }, mapping, programme.fields, new Set(existing.map((member) => member.email)));
  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.idMember.createManyAndReturn({
      data: plan.members.map((member) => ({
        programmeId: programme.id,
        organisationId: access.organisation.id,
        name: member.name,
        email: member.email,
        fieldValues: member.values,
        source: "IMPORT" as const,
        verifyToken: newVerifyToken(),
      })),
      skipDuplicates: true,
      select: { id: true },
    });
    const approved = approve ? await approveMembers(tx, programme, created.map((row) => row.id)) : 0;
    return { created: created.length, approved };
  }, { timeout: 30_000 });
  await recordAuditEvent({
    action: "ID_MEMBERS_IMPORTED",
    actorUserId: access.userId,
    organisationId: access.organisation.id,
    targetType: "IdProgramme",
    targetId: programme.id,
    metadata: { created: result.created, approved: result.approved, duplicates: plan.duplicates + (plan.members.length - result.created), skipped: plan.skipped.length },
  });
  revalidate(access, programme.id);
  return { ok: true, data: { ...result, duplicates: plan.duplicates + (plan.members.length - result.created), skipped: plan.skipped.slice(0, 50) } };
}
