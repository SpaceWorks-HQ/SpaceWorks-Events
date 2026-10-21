import { z } from "zod";
import { ID_PREFIX_PATTERN, MAX_FIELD_OPTIONS, MAX_PROGRAMME_FIELDS, MEMBER_NAME_MAX } from "@/lib/memberIds/core";
import { MEMBER_ID_PRESETS } from "@/lib/memberIds/design";
import { IMPORT_CELL_MAX, IMPORT_MAX_BYTES, IMPORT_MAX_COLUMNS, IMPORT_MAX_ROWS } from "@/lib/memberIds/importRows";
import { MAX_BULK } from "./helpers";

export const orgInput = z.object({ organisationSlug: z.string().trim().min(1).max(120) });
export const programmeInput = orgInput.extend({ programmeId: z.string().trim().min(1).max(128) });
export const idList = z.array(z.string().trim().min(1).max(128)).min(1).max(MAX_BULK);

export const createInput = orgInput.extend({ name: z.string().trim().min(2).max(80), preset: z.enum(MEMBER_ID_PRESETS).optional() }).strict();

export const detailsInput = programmeInput.extend({
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

export const fieldInput = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{1,48}$/).optional(),
  label: z.string().trim().min(1).max(60),
  type: z.enum(["TEXT", "SELECT", "DATE", "EMAIL", "PHONE"]),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(60)).max(MAX_FIELD_OPTIONS),
  placement: z.enum(["FRONT", "BACK", "HIDDEN"]),
}).strict();

export const fieldsInput = programmeInput.extend({ fields: z.array(fieldInput).max(MAX_PROGRAMME_FIELDS) }).strict();

export const designInput = programmeInput.extend({ design: z.record(z.string(), z.unknown()) }).strict();

export const memberFields = z.object({
  name: z.string().trim().min(1).max(MEMBER_NAME_MAX),
  email: z.string().trim().toLowerCase().max(320),
  values: z.record(z.string().max(48), z.string().max(400)),
});

export const addInput = programmeInput.extend(memberFields.shape).extend({ approve: z.boolean() }).strict();

export const updateMemberInput = programmeInput.extend(memberFields.shape).extend({ memberId: z.string().trim().min(1).max(128) }).strict();

export const memberInput = programmeInput.extend({ memberId: z.string().trim().min(1).max(128) }).strict();

export const statusInput = programmeInput.extend({
  memberIds: idList,
  action: z.enum(["approve", "reject", "revoke", "reinstate"]),
  reason: z.string().trim().max(300).optional(),
}).strict();

export const STATUS_AUDIT = { approve: "ID_MEMBERS_APPROVED", reject: "ID_MEMBERS_REJECTED", revoke: "ID_MEMBERS_REVOKED", reinstate: "ID_MEMBERS_REINSTATED" } as const;

export const renewInput = programmeInput.extend({ memberIds: idList.optional() }).strict();

export const emailInput = programmeInput.extend({ memberIds: idList.optional() }).strict();

export const sourceInput = programmeInput.extend({
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("csv"), text: z.string().max(IMPORT_MAX_BYTES) }).strict(),
    z.object({ kind: z.literal("sheet"), url: z.string().trim().max(500) }).strict(),
  ]),
}).strict();

export const targetSchema = z.string().max(60).refine((value) => value === "" || value === "name" || value === "email" || /^field:[a-z0-9_]{1,48}$/.test(value));

export const commitInput = programmeInput.extend({
  headers: z.array(z.string().max(IMPORT_CELL_MAX)).min(1).max(IMPORT_MAX_COLUMNS),
  rows: z.array(z.array(z.string().max(IMPORT_CELL_MAX)).max(IMPORT_MAX_COLUMNS)).min(1).max(IMPORT_MAX_ROWS),
  mapping: z.array(targetSchema).max(IMPORT_MAX_COLUMNS),
  approve: z.boolean(),
}).strict();

