"use server";

import { z } from "zod";
import { RegistrationFieldType } from "@prisma/client";
import type { ActionResult } from "@/app/actions/org";
import { flattenZodErrors } from "@/app/actions/utils";
import { prisma } from "@/lib/db";
import { requireOrgRole } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { fieldSettingsSchema, fieldTypeMeta, generateFieldKey, settingsForType } from "@/lib/registrationFields";

/** A user-facing problem with a question's "show only if" rule. */
class ConditionError extends Error {}

const upsertFieldSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  eventId: z.string().trim().min(1),
  fieldId: z.string().trim().min(1).optional(),
  /** Optional: generated from the question text when a question is created, then kept fixed. */
  key: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-zA-Z0-9_]*$/, "Use letters, numbers, and underscores only")
    .optional(),
  label: z.string().trim().min(1, "Write the question").max(200),
  helpText: z.string().trim().max(300, "Keep the help text under 300 characters").optional().default(""),
  placeholder: z.string().trim().max(120, "Keep the example under 120 characters").optional().default(""),
  settings: fieldSettingsSchema.optional().default({}),
  type: z.nativeEnum(RegistrationFieldType),
  required: z.preprocess(
    (v) => v === true || v === "true" || v === "on",
    z.boolean(),
  ),
  options: z.preprocess((v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      return v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }, z.array(z.string().trim().min(1).max(200)).max(100).transform((items) => [...new Set(items)])).optional().default([]),
});

export async function upsertEventRegistrationField(
  input: unknown,
): Promise<ActionResult<{ fieldId: string }>> {
  const parsed = upsertFieldSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { organisationSlug, eventId, fieldId, label, type, required, helpText, placeholder } =
    parsed.data;
  const options = parsed.data.options ?? [];
  const settings = settingsForType(type, parsed.data.settings);

  const { organisation, userId } = await requireOrgRole(organisationSlug, "ADMIN");
  if (await isActionRateLimited("rsvp", userId)) return { ok: false, error: "Too many form updates. Try again shortly." };
  const event = await prisma.event.findFirst({
    where: { id: eventId, organisationId: organisation.id },
    select: { id: true },
  });
  if (!event) return { ok: false, error: "Event not found." };

  const needsOptions =
    type === RegistrationFieldType.SELECT ||
    type === RegistrationFieldType.MULTI_SELECT ||
    type === RegistrationFieldType.RADIO;
  if (needsOptions && options.length === 0) {
    return { ok: false, error: "Add at least one choice." };
  }
  const usesPlaceholder = fieldTypeMeta(type).isText;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const form = await tx.eventRegistrationForm.upsert({
        where: { eventId: event.id },
        create: { eventId: event.id },
        update: {},
        select: { id: true },
      });

      const siblings = await tx.eventRegistrationField.findMany({
        where: { formId: form.id },
        select: { id: true, key: true, type: true, options: true, sortOrder: true },
      });
      const self = fieldId ? siblings.find((field) => field.id === fieldId) : undefined;
      if (fieldId && !self) throw new Error("Field does not belong to this event.");

      // "Show only if" must point at an earlier choice or yes/no question on this form.
      if (settings.showIf) {
        const trigger = siblings.find((field) => field.key === settings.showIf!.fieldKey);
        const ownOrder = self?.sortOrder ?? Number.POSITIVE_INFINITY;
        if (!trigger || trigger.id === fieldId || trigger.sortOrder >= ownOrder || !fieldTypeMeta(trigger.type).canTrigger) {
          throw new ConditionError("Choose an earlier multiple-choice, dropdown, checkbox or yes/no question.");
        }
        const allowed = trigger.type === "CHECKBOX" ? ["Yes", "No"] : Array.isArray(trigger.options) ? trigger.options.filter((value): value is string => typeof value === "string") : [];
        const values = settings.showIf.values.filter((value) => allowed.includes(value));
        if (values.length === 0) throw new ConditionError("Pick at least one answer that shows this question.");
        settings.showIf = { fieldKey: trigger.key, values };
      }

      const data = {
        label,
        type,
        required,
        options: needsOptions ? options : [],
        helpText,
        placeholder: usesPlaceholder ? placeholder : "",
        settings,
      };

      if (fieldId) {
        // The key stays fixed so existing answers and links keep working.
        const updated = await tx.eventRegistrationField.updateMany({
          where: { id: fieldId, formId: form.id },
          data,
        });
        if (updated.count !== 1) throw new Error("Field does not belong to this event.");
        return { id: fieldId, formId: form.id };
      }

      const max = await tx.eventRegistrationField.aggregate({
        where: { formId: form.id },
        _max: { sortOrder: true },
      });
      const sortOrder = (max._max.sortOrder ?? 0) + 1;

      const requested = parsed.data.key?.trim();
      const taken = siblings.map((field) => field.key);
      const key = requested && !taken.includes(requested) ? requested : generateFieldKey(label, taken);

      return await tx.eventRegistrationField.create({
        data: {
          formId: form.id,
          key,
          sortOrder,
          ...data,
        },
        select: { id: true, formId: true },
      });
    });

    await recordAuditEvent({
      action: fieldId ? "REGISTRATION_FIELD_UPDATED" : "REGISTRATION_FIELD_CREATED",
      actorUserId: userId,
      organisationId: organisation.id,
      targetType: "EventRegistrationField",
      targetId: result.id,
      metadata: { eventId },
    });

    return { ok: true, data: { fieldId: result.id } };
  } catch (e: unknown) {
    if (e instanceof ConditionError) return { ok: false, error: e.message };
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return { ok: false, error: "That question already exists. Try again." };
    }
    console.error("[registration form] update failed");
    return { ok: false, error: "Could not save field." };
  }
}

const deleteFieldSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  eventId: z.string().trim().min(1),
  fieldId: z.string().trim().min(1),
});

export async function deleteEventRegistrationField(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  const parsed = deleteFieldSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { organisationSlug, eventId, fieldId } = parsed.data;
  const { organisation, userId } = await requireOrgRole(organisationSlug, "ADMIN");
  if (await isActionRateLimited("rsvp", userId)) return { ok: false, error: "Too many form updates. Try again shortly." };

  const event = await prisma.event.findFirst({
    where: { id: eventId, organisationId: organisation.id },
    select: { id: true },
  });
  if (!event) return { ok: false, error: "Event not found." };

  const form = await prisma.eventRegistrationForm.findUnique({
    where: { eventId: event.id },
    select: { id: true },
  });
  if (!form) return { ok: false, error: "Registration form not found." };

  const field = await prisma.eventRegistrationField.findUnique({
    where: { id: fieldId },
    select: { id: true, formId: true },
  });
  if (!field || field.formId !== form.id) {
    return { ok: false, error: "Field not found." };
  }

  await prisma.eventRegistrationField.delete({ where: { id: fieldId } });
  await recordAuditEvent({ action: "REGISTRATION_FIELD_DELETED", actorUserId: userId, organisationId: organisation.id, targetType: "EventRegistrationField", targetId: fieldId, metadata: { eventId } });
  return { ok: true, data: { ok: true } };
}

const reorderSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  eventId: z.string().trim().min(1),
  fieldIds: z.array(z.string().trim().min(1)).min(1).max(200).refine((ids) => new Set(ids).size === ids.length, "Field IDs must be unique."),
});

export async function reorderEventRegistrationFields(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { organisationSlug, eventId, fieldIds } = parsed.data;
  const { organisation, userId } = await requireOrgRole(organisationSlug, "ADMIN");
  if (await isActionRateLimited("rsvp", userId)) return { ok: false, error: "Too many form updates. Try again shortly." };

  const event = await prisma.event.findFirst({
    where: { id: eventId, organisationId: organisation.id },
    select: { id: true },
  });
  if (!event) return { ok: false, error: "Event not found." };

  const form = await prisma.eventRegistrationForm.findUnique({
    where: { eventId: event.id },
    select: { id: true },
  });
  if (!form) return { ok: false, error: "Registration form not found." };

  const existing = await prisma.eventRegistrationField.findMany({
    where: { formId: form.id },
    select: { id: true },
  });
  const existingSet = new Set(existing.map((f) => f.id));
  if (fieldIds.length !== existing.length) return { ok: false, error: "Invalid field list." };
  for (const id of fieldIds) {
    if (!existingSet.has(id)) {
      return { ok: false, error: "Invalid field list." };
    }
  }

  await prisma.$transaction(
    fieldIds.map((id, idx) =>
      prisma.eventRegistrationField.update({
        where: { id },
        data: { sortOrder: idx + 1 },
      }),
    ),
  );

  await recordAuditEvent({ action: "REGISTRATION_FIELDS_REORDERED", actorUserId: userId, organisationId: organisation.id, targetType: "Event", targetId: eventId, metadata: { fields: fieldIds.length } });

  return { ok: true, data: { ok: true } };
}
