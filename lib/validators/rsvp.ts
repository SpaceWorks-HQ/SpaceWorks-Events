import { z } from "zod";
import { attendeeNameSchema, orgScoped } from "@/lib/validators/shared";

const rsvpTargetBase = z
  .object({
    orgSlug: z.string().trim().min(1),
    eventSlug: z.string().trim().optional(),
    eventInstanceId: z.string().trim().optional(),
    /** Events that sell ticket types: what to buy. `ticketTypeId` is shorthand for one ticket. */
    ticketTypeId: z.string().trim().min(1).max(64).optional(),
    items: z.array(z.object({
      ticketTypeId: z.string().trim().min(1).max(64),
      quantity: z.number().int().min(0).max(20),
      /** Pay what you want: the price chosen per ticket, in minor units. */
      amountMinor: z.number().int().min(0).max(100_000_000).nullable().optional(),
    }).strict()).max(20).optional(),
    addOns: z.array(z.object({ addOnId: z.string().trim().min(1).max(64), quantity: z.number().int().min(0).max(100) }).strict()).max(20).optional(),
    /** Unlocks tickets hidden behind an access code. */
    accessCode: z.string().trim().max(32).optional().or(z.literal("")),
    /** Reserve now and pay in person, where every chosen ticket allows it. */
    payAtDesk: z.boolean().optional(),
    /** Optional details for the second and later tickets. */
    attendees: z.array(z.object({
      name: z.string().trim().max(200).optional(),
      email: z.string().trim().max(320).email("Enter a valid email for each attendee, or leave it blank.").optional().or(z.literal("")),
    }).strict()).max(19).optional(),
    promoCode: z.string().trim().max(32).optional().or(z.literal("")),
  })
  .refine(
    (d) => Boolean(d.eventSlug?.length) !== Boolean(d.eventInstanceId?.length),
    { message: "Event or instance is required.", path: ["eventSlug"] },
  );

export const rsvpGuestSchema = rsvpTargetBase.extend({
  guestEmail: z.string().trim().email("Valid email required"),
  name: attendeeNameSchema,
  answers: z.record(z.string(), z.unknown()).optional().default({}),
});

export const rsvpLoggedInSchema = rsvpTargetBase.extend({
  name: attendeeNameSchema.optional().or(z.literal("")),
  answers: z.record(z.string(), z.unknown()).optional().default({}),
});

/** An organisation admin adding a guest RSVP from the attendee dashboard. */
export const manualRsvpSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  eventId: z.string().trim().min(1),
  guestEmail: z.string().trim().email("Valid email required"),
  name: attendeeNameSchema,
  answers: z.record(z.string(), z.unknown()).optional().default({}),
});

/** An organisation admin editing an existing RSVP registration. */
export const updateRsvpRegistrationSchema = z
  .object({
    organisationSlug: z.string().trim().min(1),
    eventId: z.string().trim().optional(),
    eventInstanceId: z.string().trim().optional(),
    rsvpId: z.string().trim().min(1),
    name: attendeeNameSchema.optional().or(z.literal("")),
    guestEmail: z
      .string()
      .trim()
      .email("Valid email required")
      .optional()
      .or(z.literal("")),
    answers: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .refine(
    (d) => Boolean(d.eventId?.length) !== Boolean(d.eventInstanceId?.length),
    { message: "Event or instance is required.", path: ["eventId"] },
  );

export const deleteRsvpSchema = z
  .object({
    organisationSlug: z.string().trim().min(1),
    eventId: z.string().trim().optional(),
    eventInstanceId: z.string().trim().optional(),
    rsvpId: z.string().trim().min(1),
  })
  .refine(
    (d) => Boolean(d.eventId?.length) !== Boolean(d.eventInstanceId?.length),
    { message: "Event or instance is required.", path: ["eventId"] },
  );

export const restoreRsvpSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  undoId: z.string().trim().min(1),
});

export const rsvpTransitionSchema = orgScoped
  .extend({
    rsvpId: z.string().trim().min(1),
    eventId: z.string().trim().optional(),
    eventInstanceId: z.string().trim().optional(),
  })
  .refine(
    (d) => Boolean(d.eventId?.length) !== Boolean(d.eventInstanceId?.length),
    { message: "Event or instance is required.", path: ["eventId"] },
  );
