import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { ContentVisibility } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolvePublicEventAccess } from "@/lib/publicEventAccess";
import { sanitizeRichText } from "@/lib/richText";
import { accentStyle } from "@/lib/theme/accent";
import { effectiveEventProgram } from "@/lib/eventProgram";
import { formatDayShort, formatTime } from "@/lib/format/datetime";
import { Breadcrumb } from "@/components/event/Breadcrumb";
import { Avatar } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Event speaker" };

export default async function SpeakerPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string; speakerSlug: string }> }) {
  const { orgSlug, eventSlug, speakerSlug } = await params;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug } });
  if (!org) notFound();
  const event = await prisma.event.findUnique({ where: { organisationId_slug: { organisationId: org.id, slug: eventSlug } }, include: { page: { select: { isPublished: true, accentColor: true } } } });
  if (!event) notFound();
  const access = await resolvePublicEventAccess({ organisationId: org.id, eventId: event.id, status: event.status, privacyType: event.privacyType, websiteReleased: event.page?.isPublished ?? false });
  if (!access.allowed) notFound();
  const speaker = await prisma.eventSpeaker.findFirst({ where: { eventId: event.id, slug: speakerSlug, visibility: ContentVisibility.PUBLISHED }, include: { sessions: { include: { session: { include: { track: { select: { name: true } } } } } } } });
  if (!speaker) notFound();

  // Show live (delay-adjusted) times, matching the programme.
  const programme = effectiveEventProgram(
    await prisma.eventSession.findMany({ where: { eventId: event.id, visibility: ContentVisibility.PUBLISHED }, select: { id: true, trackId: true, startDateTime: true, endDateTime: true, sortOrder: true, delayMinutes: true } }),
  );
  const startById = new Map(programme.map((item) => [item.id, item.effectiveStartDateTime]));
  const sessions = speaker.sessions
    .map(({ session }) => session)
    .filter((session) => session.visibility === ContentVisibility.PUBLISHED)
    .map((session) => ({ ...session, start: startById.get(session.id) ?? session.startDateTime }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  return (
    <div style={accentStyle(event.page?.accentColor)} className="yy-accent-scope mx-auto flex w-full max-w-[832px] flex-col gap-8">
      <Breadcrumb items={[{ label: event.title, href: `/${org.slug}/${event.slug}` }, { label: "Speakers", href: `/${org.slug}/${event.slug}#speakers` }]} />
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-7">
        <Avatar name={speaker.name} src={speaker.photoUrl} tone="accent" className="size-28 text-4xl sm:size-[136px] sm:text-5xl" />
        <div className="flex min-w-0 flex-col items-start gap-2">
          <h1 className="text-display-m break-words text-ink">{speaker.name}</h1>
          {speaker.headline || speaker.organisation ? <p className="text-body-l text-ink-secondary">{[speaker.headline, speaker.organisation].filter(Boolean).join(" · ")}</p> : null}
          {speaker.websiteUrl ? (
            <Button asChild variant="secondary" size="sm" className="mt-1">
              <a href={speaker.websiteUrl} target="_blank" rel="noreferrer">
                Website
                <ArrowUpRight aria-hidden className="size-4" />
              </a>
            </Button>
          ) : null}
        </div>
      </header>
      {speaker.bioHtml ? <div className="yy-prose max-w-[640px] text-body-l" dangerouslySetInnerHTML={{ __html: sanitizeRichText(speaker.bioHtml) }} /> : null}
      {sessions.length > 0 ? (
        <section aria-labelledby="speaker-sessions">
          <h2 id="speaker-sessions" className="mb-3 text-h2 text-ink">Sessions</h2>
          <ul className="flex flex-col gap-3">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link href={`/${org.slug}/${event.slug}/sessions/${session.slug}`} className="flex items-center gap-5 rounded-lg border border-line bg-canvas p-4 transition-colors hover:bg-subtle">
                  <span className="w-[112px] shrink-0">
                    <span className="block text-[15px] font-bold text-ink">{formatTime(session.start, event.timezone)}</span>
                    <span className="block text-sm text-ink-muted">{formatDayShort(session.start, event.timezone)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-bold text-ink">{session.title}</span>
                    <span className="block text-sm text-ink-muted">{[session.track.name, session.type].filter(Boolean).join(" · ")}</span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
