import { BroadcastAttendanceFilter, RsvpStatus } from "@prisma/client";
import { z } from "zod";
import { BROADCAST_DESIGN_IDS, DEFAULT_BROADCAST_DESIGN } from "@/lib/email/broadcastDesigns";
import { orgScoped } from "@/lib/validators/shared";

const broadcastAudienceFields = {
  eventId: z.string().trim().min(1),
  statuses: z.array(z.nativeEnum(RsvpStatus)).min(1, "Choose at least one registration status").max(4),
  attendance: z.nativeEnum(BroadcastAttendanceFilter).default(BroadcastAttendanceFilter.ANY),
};

const broadcastSubjectSchema = z.string().trim().min(1, "Subject is required").max(150, "Keep the subject under 150 characters");
const broadcastDesignSchema = z.enum(BROADCAST_DESIGN_IDS).default(DEFAULT_BROADCAST_DESIGN);
const broadcastBodySchema = z.string().trim().min(1, "Message is required").max(20000, "Keep the message under 20,000 characters");

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
