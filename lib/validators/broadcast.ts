import { BroadcastAttendanceFilter, RsvpStatus } from "@prisma/client";
import { z } from "zod";
import { BROADCAST_DESIGN_IDS, DEFAULT_BROADCAST_DESIGN } from "@/lib/email/broadcastDesigns";
import { BROADCAST_BODY_MAX, BROADCAST_STARTER_TEMPLATES, BROADCAST_SUBJECT_MAX } from "@/lib/broadcastTemplate";
import { orgScoped } from "@/lib/validators/shared";

const broadcastAudienceFields = {
  eventId: z.string().trim().min(1),
  statuses: z.array(z.nativeEnum(RsvpStatus)).min(1, "Choose at least one registration status").max(4),
  attendance: z.nativeEnum(BroadcastAttendanceFilter).default(BroadcastAttendanceFilter.ANY),
};

const BROADCAST_SUBJECT_TOO_LONG = `Keep the subject under ${BROADCAST_SUBJECT_MAX} characters`;
const BROADCAST_BODY_TOO_LONG = `Keep the message under ${BROADCAST_BODY_MAX.toLocaleString("en")} characters`;
const broadcastSubjectSchema = z.string().trim().min(1, "Subject is required").max(BROADCAST_SUBJECT_MAX, BROADCAST_SUBJECT_TOO_LONG);
const broadcastDesignSchema = z.enum(BROADCAST_DESIGN_IDS).default(DEFAULT_BROADCAST_DESIGN);
const broadcastBodySchema = z.string().trim().min(1, "Message is required").max(BROADCAST_BODY_MAX, BROADCAST_BODY_TOO_LONG);
const broadcastTemplateIds = new Set(BROADCAST_STARTER_TEMPLATES.map((template) => template.id));

export const broadcastAudienceSchema = orgScoped.extend(broadcastAudienceFields);

export const sendEventBroadcastSchema = orgScoped.extend({
  ...broadcastAudienceFields,
  subject: broadcastSubjectSchema,
  body: broadcastBodySchema,
  design: broadcastDesignSchema,
});

export const sendEventBroadcastTestSchema = orgScoped.extend({
  eventId: z.string().trim().min(1),
  subject: broadcastSubjectSchema,
  body: broadcastBodySchema,
  design: broadcastDesignSchema,
});

export const previewEventBroadcastSchema = sendEventBroadcastTestSchema;

/** Identifies the signed-in organiser's own draft for one event. */
export const eventBroadcastDraftRefSchema = orgScoped.extend({
  eventId: z.string().trim().min(1).max(128),
});

/**
 * A draft is work in progress, so the subject, message, and audience may be
 * empty, but the length limits are exactly the send schema's. A template id
 * the server no longer knows is dropped rather than rejected.
 */
export const saveEventBroadcastDraftSchema = eventBroadcastDraftRefSchema.extend({
  subject: z.string().max(BROADCAST_SUBJECT_MAX, BROADCAST_SUBJECT_TOO_LONG),
  body: z.string().max(BROADCAST_BODY_MAX, BROADCAST_BODY_TOO_LONG),
  design: broadcastDesignSchema,
  statuses: z.array(z.nativeEnum(RsvpStatus)).max(4).transform((statuses) => [...new Set(statuses)]),
  attendance: z.nativeEnum(BroadcastAttendanceFilter).default(BroadcastAttendanceFilter.ANY),
  templateId: z
    .string()
    .max(64)
    .nullable()
    .default(null)
    .transform((id) => (id && broadcastTemplateIds.has(id) ? id : null)),
}).strict();
