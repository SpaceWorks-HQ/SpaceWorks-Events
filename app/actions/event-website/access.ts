import { ContentVisibility, EventPermission } from "@prisma/client";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAccessEvent } from "@/lib/eventAccess";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import type { ActionResult } from "../org";
import { isUploadedImageUrl } from "@/lib/uploadUrl";

export const revalidatePath = trackedRevalidation(nextRevalidatePath);

export const http = z
  .string()
  .url()
  .refine((value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Use an HTTP(S) URL");
export const optionalUrl = z.union([http, z.literal(""), z.null()]).optional();
// Safe derivatives use an application-relative delivery URL in local/self-hosted
// setups where NEXT_PUBLIC_BASE_URL is intentionally not configured.
export const optionalImageUrl = z
  .union([
    z.string().refine(isUploadedImageUrl, "Invalid uploaded image URL"),
    z.literal(""),
    z.null(),
  ])
  .optional();
export const target = z.object({
  organisationSlug: z.string().min(1),
  eventId: z.string().min(1),
});
export const visibility = z
  .nativeEnum(ContentVisibility)
  .default(ContentVisibility.DRAFT);
export const MAX_SPEAKER_PHOTO_BYTES = 5 * 1024 * 1024;

export async function context(
  input: z.infer<typeof target>,
  permission: EventPermission,
) {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (await isActionRateLimited("action", session.user.id)) return null;
  const org = await prisma.organisation.findUnique({
    where: { slug: input.organisationSlug },
  });
  if (
    !org ||
    !(await canAccessEvent({
      userId: session.user.id,
      organisationId: org.id,
      eventId: input.eventId,
      permission,
    }))
  )
    return null;
  const event = await prisma.event.findFirst({
    where: { id: input.eventId, organisationId: org.id },
    select: { id: true, slug: true, status: true },
  });
  return event ? { session, org, event } : null;
}
export function paths(orgSlug: string, event: { id: string; slug: string; }) {
  revalidatePath(`/${orgSlug}/${event.slug}`);
  revalidatePath(`/${orgSlug}/${event.slug}/schedule`);
  revalidatePath(`/dashboard/${orgSlug}/event/${event.id}`);
  revalidatePath(`/dashboard/${orgSlug}/event/${event.id}/schedule`);
}
export function fail(message: string): ActionResult {
  return { ok: false, error: message };
}
