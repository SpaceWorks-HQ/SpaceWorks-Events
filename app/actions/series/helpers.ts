import { revalidatePath as nextRevalidatePath } from "next/cache";
import { z } from "zod";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageEvents, getMembership } from "@/lib/permissions";
import { isActionRateLimited } from "@/lib/actionRateLimit";

export const revalidatePath = trackedRevalidation(nextRevalidatePath);

export function revalidateAllSeriesPaths(
  orgSlug: string,
  seriesId: string,
  instanceIds: string[],
) {
  revalidatePath(`/dashboard/${orgSlug}`);
  revalidatePath(`/dashboard/${orgSlug}/series/${seriesId}`);
  revalidatePath(`/${orgSlug}`);
  for (const id of instanceIds) {
    revalidatePath(`/${orgSlug}/i/${id}`);
  }
}

const dateSchema = z.object({
  organisationSlug: z.string().trim().min(1).max(120),
  eventSeriesId: z.string().trim().min(1).max(128),
  instanceId: z.string().trim().min(1).max(128),
});
export const capacitySchema = dateSchema.extend({ capacity: z.number().int().min(1).max(1_000_000).nullable() }).strict();
export const cancelDateSchema = dateSchema.extend({ reason: z.string().trim().max(500).default("") }).strict();

/** Owners and admins manage a series' dates, as they edit the series. */
export async function dateAccess(organisationSlug: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." } as const;
  if (await isActionRateLimited("action", session.user.id)) return { error: "Too many updates. Please try again later." } as const;
  const org = await prisma.organisation.findUnique({ where: { slug: organisationSlug }, select: { id: true, slug: true } });
  if (!org) return { error: "Organisation not found." } as const;
  if (!canManageEvents(await getMembership(session.user.id, org.id))) return { error: "You do not have permission to change this series." } as const;
  return { org, userId: session.user.id };
}
