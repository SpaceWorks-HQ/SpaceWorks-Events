import { revalidatePath as nextRevalidatePath } from "next/cache";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { prisma } from "@/lib/db";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { EventPermission, type Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canAccessEvent } from "@/lib/eventAccess";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/**
 * Ticket types, prices, promo codes and the refund policy belong to the
 * organisation's owners and admins, and to collaborators granted
 * EDIT_DETAILS on this event.
 */
type Owner = { eventId: string; } | { eventSeriesId: string; };
type Access = { organisation: { id: string; slug: string; }; userId: string; owner: Owner; currency: string | null; paths: string[]; };

export async function access(input: { organisationSlug: string; eventId?: string; seriesId?: string; }): Promise<Access | { error: string; }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };
  const userId = session.user.id;
  const organisation = await prisma.organisation.findUnique({ where: { slug: input.organisationSlug }, select: { id: true, slug: true } });
  const scope = input.eventId ? { eventId: input.eventId } : { eventSeriesId: input.seriesId };
  if (!organisation || !(await canAccessEvent({ userId, organisationId: organisation.id, ...scope, permission: EventPermission.EDIT_DETAILS }))) {
    return { error: "You don't have permission to change this event's tickets." };
  }
  if (await isActionRateLimited("action", userId)) return { error: "Too many ticket changes. Try again shortly." };
  if (input.eventId) {
    const event = await prisma.event.findFirst({ where: { id: input.eventId, organisationId: organisation.id }, select: { id: true, slug: true, currency: true } });
    if (!event) return { error: "Event not found." };
    return { organisation, userId, owner: { eventId: event.id }, currency: event.currency, paths: [`/${organisation.slug}/${event.slug}`, `/dashboard/${organisation.slug}/event/${event.id}`] };
  }
  const series = await prisma.eventSeries.findFirst({ where: { id: input.seriesId, organisationId: organisation.id }, select: { id: true, currency: true } });
  if (!series) return { error: "Series not found." };
  return { organisation, userId, owner: { eventSeriesId: series.id }, currency: series.currency, paths: [`/dashboard/${organisation.slug}/series/${series.id}`] };
}

export function revalidateOwner(context: Access) {
  for (const path of context.paths) revalidatePath(path);
}

/** Set the currency with the first ticket; the database locks it after that. */
export async function setOwnerCurrency(tx: Prisma.TransactionClient, owner: Owner, currency: string) {
  if ("eventId" in owner) await tx.event.update({ where: { id: owner.eventId }, data: { currency } });
  else await tx.eventSeries.update({ where: { id: owner.eventSeriesId }, data: { currency } });
}
