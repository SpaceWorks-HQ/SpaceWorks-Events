import { eventForView } from "@/lib/frontend/eventView";
import { notFound } from "next/navigation";
import { ContentVisibility } from "@prisma/client";
import { prisma } from "@/lib/db";
import { effectiveEventProgram } from "@/lib/eventProgram";
import { resolvePublicEventAccess } from "@/lib/publicEventAccess";
import { formatTimeZoneName } from "@/lib/format/datetime";

export async function loadEventScheduleView({ params }: { params: Promise<{ orgSlug: string; eventSlug: string; }>; }) {
  const { orgSlug, eventSlug } = await params;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug } });
  if (!org) notFound();
  const event = await prisma.event.findUnique({ where: { organisationId_slug: { organisationId: org.id, slug: eventSlug } }, include: { page: { select: { isPublished: true, accentColor: true } }, scheduleTracks: { orderBy: { sortOrder: "asc" }, include: { sessions: { where: { visibility: ContentVisibility.PUBLISHED }, orderBy: [{ startDateTime: "asc" }, { sortOrder: "asc" }], include: { speakers: { where: { speaker: { visibility: ContentVisibility.PUBLISHED } }, include: { speaker: { select: { name: true } } }, orderBy: { sortOrder: "asc" } } } } } } } });
  if (!event) notFound();
  const access = await resolvePublicEventAccess({ organisationId: org.id, eventId: event.id, status: event.status, privacyType: event.privacyType, websiteReleased: event.page?.isPublished ?? false });
  if (!access.allowed) notFound();
  const tracks = event.scheduleTracks.map((track) => ({ ...track, sessions: effectiveEventProgram(track.sessions) })).filter((track) => track.sessions.length > 0);
  const zone = formatTimeZoneName(event.startDateTime, event.timezone);
  return { event: eventForView(event), org, zone, tracks };
}
