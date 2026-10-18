import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { loadAttendees, loadEventInvites, loadRegistrationFields } from "@/lib/eventDashboard/data";

export async function loadGuestsPanel({ ctx }: { ctx: EventDashboardContext; }) {
  ctx = await loadEventDashboard(ctx.organisation.slug, ctx.event.id);
  const { event, permissions, organisation } = ctx;
  const [attendees, fields, invites] = await Promise.all([
    permissions.canManageRegistrations ? loadAttendees(event.id, ctx.origin) : Promise.resolve({ attendees: [], truncated: false }),
    loadRegistrationFields(event.id),
    permissions.canManageInvitations ? loadEventInvites(event.id) : Promise.resolve([]),
  ]);
  return { permissions, organisation, event, attendees, fields, invites };
}

import { loadEventDashboard } from "@/lib/eventDashboard/context";
