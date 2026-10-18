import { eventForView } from "@/lib/frontend/eventView";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { canAccessEvent, canViewEventDashboard } from "@/lib/eventAccess";
import { EventPermission } from "@prisma/client";
import { effectiveEventProgram } from "@/lib/eventProgram";
import { conflictingTrackSessionIds } from "@/lib/eventProgram";
import { requireOrgDashboardAccess } from "@/lib/permissions";

export async function loadEventScheduleManageView({ params }: { params: Promise<{ orgSlug: string; eventId: string; }>; }) {
  const { orgSlug, eventId } = await params;
  const access = await requireOrgDashboardAccess(orgSlug);
  const event = await prisma.event.findFirst({ where: { id: eventId, organisationId: access.organisation.id }, include: { page: { select: { accentColor: true } }, scheduleTracks: { orderBy: { sortOrder: "asc" } }, sessions: { include: { speakers: { include: { speaker: { select: { id: true, name: true } } } } }, orderBy: [{ startDateTime: "asc" }, { sortOrder: "asc" }] }, speakers: { select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } } });
  if (!event) notFound();
  if (!access.membership && !(await canViewEventDashboard({ userId: access.userId, organisationId: access.organisation.id, eventId: event.id }))) notFound();
  if (!(await canAccessEvent({ userId: access.userId, organisationId: access.organisation.id, eventId: event.id, permission: EventPermission.PUBLISH_AND_SCHEDULE }))) notFound();
  const conflictIds = conflictingTrackSessionIds(event.sessions);
  const sessions = effectiveEventProgram(event.sessions).map((session) => ({ id: session.id, trackId: session.trackId, title: session.title, descriptionHtml: session.descriptionHtml, startDateTime: session.startDateTime.toISOString(), endDateTime: session.endDateTime.toISOString(), effectiveStartDateTime: session.effectiveStartDateTime.toISOString(), effectiveEndDateTime: session.effectiveEndDateTime.toISOString(), type: session.type, visibility: session.visibility, sortOrder: session.sortOrder, delayMinutes: session.delayMinutes, cumulativeDelayMinutes: session.cumulativeDelayMinutes, speakerIds: session.speakers.map((speaker) => speaker.speakerId), speakerNames: session.speakers.map((speaker) => speaker.speaker.name), hasConflict: conflictIds.has(session.id) }));
  return { access, event: eventForView(event), sessions };
}
