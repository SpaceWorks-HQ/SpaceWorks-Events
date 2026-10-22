import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { prisma } from "@/lib/db";
import { loadAttendees, loadEventInvites, loadRegistrationFields } from "@/lib/eventDashboard/data";
import { DEFAULT_CURRENCY } from "@/lib/payments/money";

export async function loadGuestsPanel({ ctx }: { ctx: EventDashboardContext; }) {
  ctx = await loadEventDashboard(ctx.organisation.slug, ctx.event.id);
  const { event, permissions, organisation } = ctx;
  const [attendees, fields, invites, ticketTypes] = await Promise.all([
    permissions.canManageRegistrations ? loadAttendees(event.id, ctx.origin) : Promise.resolve({ attendees: [], truncated: false }),
    loadRegistrationFields(event.id),
    permissions.canManageInvitations ? loadEventInvites(event.id) : Promise.resolve([]),
    permissions.canManageRegistrations
      ? prisma.ticketType.findMany({ where: { eventId: event.id, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, priceMinor: true } })
      : Promise.resolve([]),
  ]);
  const currency = event.currency ?? DEFAULT_CURRENCY;
  return {
    permissions, organisation, event, attendees, fields, invites,
    ticketTypes: ticketTypes.map((type) => ({ id: type.id, name: type.name, priceMinor: Number(type.priceMinor), currency })),
  };
}

import { loadEventDashboard } from "@/lib/eventDashboard/context";
