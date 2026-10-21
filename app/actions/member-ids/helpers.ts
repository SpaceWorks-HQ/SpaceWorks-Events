import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { memberIdsAccess, type MemberIdsAccess } from "@/lib/memberIds/access";
import { loadProgramme } from "@/lib/memberIds/data";
import type { MemberIdEmailQueueResult } from "@/lib/memberIds/email";
import { slugifyTitle } from "@/lib/slug";
import type { ActionResult } from "../org";
import type { EmailCardsResult } from "../member-ids";

export const revalidatePath = trackedRevalidation(nextRevalidatePath);

export const NOT_FOUND = "That ID programme wasn't found.";
export const MAX_BULK = 500;
export const DESIGN_AUDIT_WINDOW_MS = 10 * 60_000;

export type Manage = { ok: true; access: MemberIdsAccess; } | { ok: false; error: string; };

export async function requireManage(organisationSlug: string, bucket: "action" | "upload" | "broadcast" = "action"): Promise<Manage> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (await isActionRateLimited(bucket, userId)) return { ok: false, error: "Too many requests. Please try again shortly." };
  const access = await memberIdsAccess(userId, organisationSlug);
  if (!access) return { ok: false, error: NOT_FOUND };
  if (!access.canManage) return { ok: false, error: "Only organisation owners and admins can manage member IDs." };
  return { ok: true, access };
}

export async function requireProgramme(organisationSlug: string, programmeId: string, bucket?: "action" | "upload" | "broadcast") {
  const manage = await requireManage(organisationSlug, bucket);
  if (!manage.ok) return manage;
  const programme = await loadProgramme(manage.access.organisation.id, programmeId);
  if (!programme) return { ok: false as const, error: NOT_FOUND };
  return { ok: true as const, access: manage.access, programme };
}

export function revalidate(access: MemberIdsAccess, programmeId?: string) {
  revalidatePath(`/dashboard/${access.organisation.slug}/ids`);
  if (programmeId) revalidatePath(`/dashboard/${access.organisation.slug}/ids/${programmeId}`);
}

export async function uniqueSlug(organisationId: string, name: string, excludeId?: string) {
  const base = slugifyTitle(name).slice(0, 60) || "ids";
  for (let n = 0;n < 50;n += 1) {
    const slug = n === 0 ? base : `${base}-${n + 1}`;
    const clash = await prisma.idProgramme.findFirst({ where: { organisationId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
    if (!clash) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export function emailOutcome(result: MemberIdEmailQueueResult): ActionResult<EmailCardsResult> {
  if (result.matched === 0) return { ok: false, error: "No valid cards to send. Approve members first." };
  if (result.queued === 0) {
    return result.skippedLimit > 0
      ? { ok: false, error: "Your organisation has reached today's limit for ID card emails. Try again tomorrow." }
      : { ok: false, error: "Those cards were already emailed. A card can be emailed again 24 hours after the last send." };
  }
  return { ok: true, data: { count: result.queued, skippedRecent: result.skippedRecent, skippedLimit: result.skippedLimit } };
}
