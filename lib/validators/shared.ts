import { z } from "zod";
import { isValidTimeZone } from "@/lib/timeZone";
import { isUploadedImageUrl } from "@/lib/uploadUrl";

export const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Only HTTP and HTTPS URLs are allowed");
export const optionalHttpUrlSchema = httpUrlSchema.optional().or(z.literal(""));
export const timeZoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone is required")
  .max(64)
  .refine(isValidTimeZone, "Select a valid IANA timezone");
export const coverImageUrlSchema = z
  .union([
    z.string().refine(isUploadedImageUrl, "Invalid uploaded image URL"),
    z.literal(""),
  ])
  .optional();
export const eventPageLogoUrlSchema = z
  .union([
    z.string().refine(isUploadedImageUrl, "Invalid uploaded image URL"),
    z.literal(""),
    z.null(),
  ])
  .optional();

export function isValidAttendeeName(value: string) {
  return (
    value.length <= 200 &&
    /\p{L}/u.test(value) &&
    !/[<>\u0000-\u001F\u007F]/.test(value)
  );
}

export const attendeeNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(200, "Name must be at most 200 characters")
  .refine(isValidAttendeeName, "Enter a valid name");

export const registrationCutoffSchema = {
  registrationClosesAt: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.coerce.date().optional(),
  ),
  registrationLeadMinutes: z.preprocess(
    (value) => (value === "" || value == null ? undefined : Number(value)),
    z.number().int().min(0).max(525_600).optional(),
  ),
};

export function validateEventScheduleAndLocation(
  data: {
    startDateTime: Date;
    endDateTime: Date;
    isOnline: boolean;
    location: string;
  },
  ctx: z.RefinementCtx,
  { requireFutureStart = true }: { requireFutureStart?: boolean } = {},
) {
  if (requireFutureStart && data.startDateTime < new Date()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["startDateTime"],
      message: "Start time must be now or in the future",
    });
  }
  if (data.endDateTime <= data.startDateTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDateTime"],
      message: "End must be after start",
    });
  }
  if (data.isOnline) {
    if (!httpUrlSchema.safeParse(data.location).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["location"],
        message: "Enter a valid HTTP(S) online meeting URL",
      });
    }
  } else if (data.location.trim().length < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["location"],
      message: "Enter a physical location of at least 3 characters",
    });
  }
}

export const orgScoped = z.object({
  organisationSlug: z.string().trim().min(1),
});
