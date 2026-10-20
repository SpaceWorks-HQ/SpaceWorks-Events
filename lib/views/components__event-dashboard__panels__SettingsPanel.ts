import { prisma } from "@/lib/db";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { loadTicketSettings } from "@/lib/payments/ticketSettings";

/** Ticket types are an organisation owner/admin concern, like the actions that change them. */
async function loadTickets(ctx: EventDashboardContext) {
  if (!ctx.permissions.canEditTickets) return null;
  const policy = await prisma.event.findUniqueOrThrow({ where: { id: ctx.event.id }, select: { refundPolicyKind: true, refundPolicyHours: true, refundPolicyPercent: true, refundPolicyText: true } });
  return loadTicketSettings({ owner: { eventId: ctx.event.id }, organisation: ctx.organisation, currency: ctx.event.currency, refundPolicy: policy, now: ctx.now });
}

export async function loadSettingsPanel({ ctx }: { ctx: EventDashboardContext; }) {
  ctx = await loadEventDashboard(ctx.organisation.slug, ctx.event.id);
  const { event, permissions, organisation } = ctx;
  const [collaborators, pending] = permissions.canManageCollaborators
    ? await Promise.all([
      prisma.eventCollaborator.findMany({ where: { eventId: event.id }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
      prisma.eventCollaboratorInvite.findMany({ where: { eventId: event.id, usedAt: null, expiresAt: { gt: ctx.now } }, select: { id: true, email: true, expiresAt: true, permissions: true }, orderBy: { createdAt: "desc" } }),
    ])
    : [[], []];
  const tickets = await loadTickets(ctx);
  return { permissions, organisation, event, collaborators, pending, tickets };
}

import { loadEventDashboard } from "@/lib/eventDashboard/context";
