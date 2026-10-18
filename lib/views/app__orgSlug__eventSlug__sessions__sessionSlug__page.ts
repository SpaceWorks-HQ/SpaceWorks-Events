import { eventForView } from "@/lib/frontend/eventView";
import { notFound } from "next/navigation";
import { ContentVisibility } from "@prisma/client";
import { prisma } from "@/lib/db";
import { effectiveEventProgram } from "@/lib/eventProgram";
import { resolvePublicEventAccess } from "@/lib/publicEventAccess";

export async function loadSessionView({ params }: { params: Promise<{ orgSlug: string; eventSlug: string; sessionSlug: string; }>; }) {
  const { orgSlug, eventSlug, sessionSlug } = await params;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug } });
  if (!org) notFound();
  const event = await prisma.event.findUnique({ where: { organisationId_slug: { organisationId: org.id, slug: eventSlug } }, include: { page: { select: { isPublished: true, accentColor: true } } } });
  if (!event) notFound();
  const access = await resolvePublicEventAccess({ organisationId: org.id, eventId: event.id, status: event.status, privacyType: event.privacyType, websiteReleased: event.page?.isPublished ?? false });
  if (!access.allowed) notFound();
  const [session, programme] = await Promise.all([
    prisma.eventSession.findFirst({ where: { eventId: event.id, slug: sessionSlug, visibility: ContentVisibility.PUBLISHED }, include: { track: true, speakers: { include: { speaker: true }, orderBy: { sortOrder: "asc" } }, resources: { where: { visibility: ContentVisibility.PUBLISHED } } } }),
    prisma.eventSession.findMany({ where: { eventId: event.id, visibility: ContentVisibility.PUBLISHED }, select: { id: true, slug: true, title: true, trackId: true, track: { select: { name: true } }, startDateTime: true, endDateTime: true, sortOrder: true, delayMinutes: true, speakers: { where: { speaker: { visibility: ContentVisibility.PUBLISHED } }, select: { speaker: { select: { name: true } } }, orderBy: { sortOrder: "asc" } } } }),
  ]);
  if (!session) notFound();
  const effectiveProgramme = effectiveEventProgram(programme);
  const effective = effectiveProgramme.find((item) => item.id === session.id);
  if (!effective) notFound();
  const speakers = session.speakers.filter((item) => item.speaker.visibility === ContentVisibility.PUBLISHED).map((item) => item.speaker);
  const nextOnTrack = effectiveProgramme.filter((item) => item.trackId === session.trackId && item.effectiveStartDateTime > effective.effectiveStartDateTime)[0];
  const alsoNow = effectiveProgramme.filter((item) => item.id !== session.id && item.trackId !== session.trackId && item.effectiveStartDateTime.getTime() === effective.effectiveStartDateTime.getTime());
  return { event: eventForView(event), org, session, effective, speakers, nextOnTrack, alsoNow };
}
