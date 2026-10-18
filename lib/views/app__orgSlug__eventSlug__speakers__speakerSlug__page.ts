import { eventForView } from "@/lib/frontend/eventView";
import { notFound } from "next/navigation";
import { ContentVisibility } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolvePublicEventAccess } from "@/lib/publicEventAccess";
import { effectiveEventProgram } from "@/lib/eventProgram";

export async function loadSpeakerView({ params }: { params: Promise<{ orgSlug: string; eventSlug: string; speakerSlug: string; }>; }) {
  const { orgSlug, eventSlug, speakerSlug } = await params;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug } });
  if (!org) notFound();
  const event = await prisma.event.findUnique({ where: { organisationId_slug: { organisationId: org.id, slug: eventSlug } }, include: { page: { select: { isPublished: true, accentColor: true } } } });
  if (!event) notFound();
  const access = await resolvePublicEventAccess({ organisationId: org.id, eventId: event.id, status: event.status, privacyType: event.privacyType, websiteReleased: event.page?.isPublished ?? false });
  if (!access.allowed) notFound();
  const speaker = await prisma.eventSpeaker.findFirst({ where: { eventId: event.id, slug: speakerSlug, visibility: ContentVisibility.PUBLISHED }, include: { sessions: { include: { session: { include: { track: { select: { name: true } } } } } } } });
  if (!speaker) notFound();
  const programme = effectiveEventProgram(
    await prisma.eventSession.findMany({ where: { eventId: event.id, visibility: ContentVisibility.PUBLISHED }, select: { id: true, trackId: true, startDateTime: true, endDateTime: true, sortOrder: true, delayMinutes: true } }),
  );
  const startById = new Map(programme.map((item) => [item.id, item.effectiveStartDateTime]));
  const sessions = speaker.sessions
    .map(({ session }) => session)
    .filter((session) => session.visibility === ContentVisibility.PUBLISHED)
    .map((session) => ({ ...session, start: startById.get(session.id) ?? session.startDateTime }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  return { event: eventForView(event), org, speaker, sessions };
}
