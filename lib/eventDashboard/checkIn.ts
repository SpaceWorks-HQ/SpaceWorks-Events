import "server-only";

import { EventPermission } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getMembership } from "@/lib/permissions";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { loadRsvpStatusCounts } from "@/lib/eventDashboard/data";

/*
 * Data for the Check-in tab. Callers must already have checked
 * `ctx.permissions.canCheckIn`. Only booleans and counts leave this module:
 * the station PIN, its hash and its encrypted copy never do.
 */

export type CheckInDesk = {
  confirmed: number;
  checkedIn: number;
  /** A venue station PIN is set (boolean only). */
  stationEnabled: boolean;
  /** Station PIN actions are organisation-admin operations (app/actions/checkin-station.ts). */
  canManageStation: boolean;
  /** Mirrors /api/exports/events/[eventId]/attendees: org admins, or non-member collaborators with MANAGE_REGISTRATIONS. */
  canExportAttendance: boolean;
  /** The public station path for this event; the PIN is what protects it. */
  stationUrl: string;
};

/** The export route only honours a MANAGE_REGISTRATIONS grant for people who are not organisation members. */
async function canCollaboratorExport(eventId: string, organisationId: string, userId: string) {
  const [membership, grant] = await Promise.all([
    getMembership(userId, organisationId),
    prisma.eventCollaborator.findFirst({
      where: { eventId, userId, permissions: { has: EventPermission.MANAGE_REGISTRATIONS } },
      select: { id: true },
    }),
  ]);
  return !membership && Boolean(grant);
}

export async function loadCheckInDesk(ctx: EventDashboardContext): Promise<CheckInDesk> {
  const { event, permissions, organisation, userId, origin } = ctx;
  const [counts, exportGrant] = await Promise.all([
    loadRsvpStatusCounts(event.id),
    permissions.isAdmin ? Promise.resolve(false) : canCollaboratorExport(event.id, organisation.id, userId),
  ]);
  return {
    confirmed: counts.confirmed,
    checkedIn: counts.checkedIn,
    stationEnabled: Boolean(event.checkInStationPinHash),
    canManageStation: permissions.isAdmin,
    canExportAttendance: permissions.isAdmin || Boolean(exportGrant),
    stationUrl: `${origin}/${organisation.slug}/${event.slug}/check-in`,
  };
}
