import { z } from "zod";

export const checkInByTokenSchema = z
  .object({
    organisationSlug: z.string().trim().min(1).max(120),
    eventId: z.string().trim().min(1).max(128),
    rawInput: z.string().trim().min(1).max(2048),
    force: z.boolean().optional(),
  })
  .strict();

export const undoCheckInSchema = z
  .object({
    organisationSlug: z.string().trim().min(1).max(120),
    eventId: z.string().trim().min(1).max(128),
    rsvpId: z.string().trim().min(1).max(128),
  })
  .strict();

export const attendeeLookupSchema = z
  .object({
    organisationSlug: z.string().trim().min(1).max(120),
    eventId: z.string().trim().min(1).max(128),
    query: z.string().trim().min(2).max(200),
  })
  .strict();

export const checkInByRsvpIdSchema = z
  .object({
    organisationSlug: z.string().trim().min(1).max(120),
    eventId: z.string().trim().min(1).max(128),
    rsvpId: z.string().trim().min(1).max(128),
    force: z.boolean().optional(),
  })
  .strict();

export const offlineCheckInRosterSchema = z
  .object({
    organisationSlug: z.string().trim().min(1).max(120),
    eventId: z.string().trim().min(1).max(128),
  })
  .strict();

export const syncOfflineCheckInsSchema = offlineCheckInRosterSchema.extend({
  checkIns: z
    .array(
      z
        .object({
          rsvpId: z.string().trim().min(1).max(128),
          clientMutationId: z.string().trim().min(8).max(128),
          checkedInAt: z.string().datetime(),
          force: z.boolean().optional().default(false),
        })
        .strict(),
    )
    .min(1)
    .max(500),
});
