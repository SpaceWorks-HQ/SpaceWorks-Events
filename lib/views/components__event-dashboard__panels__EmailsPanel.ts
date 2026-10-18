import type { RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { loadRsvpStatusCounts } from "@/lib/eventDashboard/data";
export async function loadEmailsPanel({ ctx }: { ctx: EventDashboardContext; }) {
  ctx = await loadEventDashboard(ctx.organisation.slug, ctx.event.id);

  const { event, permissions, organisation, now } = ctx;
  if (!permissions.canManageRegistrations) notFound();
  const [records, counts, branding] = await Promise.all([
    prisma.eventBroadcast.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, subject: true, body: true, design: true, statuses: true, attendance: true, recipientCount: true, createdAt: true, createdBy: { select: { name: true } } },
    }),
    loadRsvpStatusCounts(event.id),
    prisma.event.findUnique({ where: { id: event.id }, select: { coverImageUrl: true, page: { select: { accentColor: true } } } }),
  ]);
  const brand = { accentColor: branding?.page?.accentColor ?? null, coverImageUrl: branding?.coverImageUrl ?? null };
  const statusCounts: Record<RsvpStatus, number> = {
    CONFIRMED: counts.confirmed,
    WAITLISTED: counts.waitlisted,
    PENDING_APPROVAL: counts.pendingApproval,
    REJECTED: counts.rejected,
  };

  return { event, permissions, organisation, now, records, brand, statusCounts };
}

import { notFound } from "next/navigation";
import { loadEventDashboard } from "@/lib/eventDashboard/context";
