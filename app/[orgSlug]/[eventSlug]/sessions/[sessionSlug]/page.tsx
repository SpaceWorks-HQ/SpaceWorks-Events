import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ContentVisibility } from "@prisma/client";
import { prisma } from "@/lib/db";
import { effectiveEventProgram } from "@/lib/eventProgram";
import { resolvePublicEventAccess } from "@/lib/publicEventAccess";
import { sanitizeRichText } from "@/lib/richText";
import { accentStyle } from "@/lib/theme/accent";
import { formatDayShort, formatTime, formatTimeRange } from "@/lib/format/datetime";
import { Breadcrumb } from "@/components/event/Breadcrumb";
import { Avatar, Chip } from "@/components/ui/display";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Event session" };

export default async function SessionPage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string; sessionSlug: string }> }) {
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
  // Navigation helpers from the published programme: the next session on this track and others starting at the same time.
  const nextOnTrack = effectiveProgramme.filter((item) => item.trackId === session.trackId && item.effectiveStartDateTime > effective.effectiveStartDateTime)[0];
  const alsoNow = effectiveProgramme.filter((item) => item.id !== session.id && item.trackId !== session.trackId && item.effectiveStartDateTime.getTime() === effective.effectiveStartDateTime.getTime());

  return (
    <div style={accentStyle(event.page?.accentColor)} className="yy-accent-scope grid gap-10 md:grid-cols-[minmax(0,1fr)_300px] md:gap-14">
      <article className="flex min-w-0 flex-col gap-5">
        <Breadcrumb items={[{ label: event.title, href: `/${org.slug}/${event.slug}` }, { label: "Programme", href: `/${org.slug}/${event.slug}/schedule` }]} />
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="accent" size="sm">{session.track.name}</Chip>
          {session.type ? <Chip size="sm">{session.type}</Chip> : null}
        </div>
        <h1 className="text-display-m break-words text-ink">{session.title}</h1>
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-body-ui text-ink-secondary">
          <span><strong className="text-ink">{formatDayShort(effective.effectiveStartDateTime, event.timezone)}</strong> · {formatTimeRange(effective.effectiveStartDateTime, effective.effectiveEndDateTime, event.timezone)}</span>
          <span>{session.track.name}</span>
        </p>
        {session.descriptionHtml ? <div className="yy-prose max-w-[640px] text-body-l" dangerouslySetInnerHTML={{ __html: sanitizeRichText(session.descriptionHtml) }} /> : null}
        {speakers.length > 0 ? (
          <section aria-labelledby="session-speakers" className="mt-3">
            <h2 id="session-speakers" className="mb-3 text-h3 text-ink">{speakers.length === 1 ? "Speaker" : "Speakers"}</h2>
            <ul className="grid max-w-[560px] gap-2.5">
              {speakers.map((speaker) => (
                <li key={speaker.id}>
                  <Link href={`/${org.slug}/${event.slug}/speakers/${speaker.slug}`} className="flex items-center gap-3.5 rounded-lg border border-line bg-canvas p-4 transition-colors hover:bg-subtle">
                    <Avatar name={speaker.name} src={speaker.photoUrl} size="lg" tone="accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-bold text-ink">{speaker.name}</span>
                      <span className="block text-sm text-ink-muted">{[speaker.headline, speaker.organisation].filter(Boolean).join(" · ")}</span>
                    </span>
                    <ArrowRight aria-hidden className="size-4 text-ink-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>

      {nextOnTrack || alsoNow.length > 0 ? (
        <aside className="flex flex-col gap-6 md:pt-1">
          {nextOnTrack ? (
            <div>
              <h2 className="mb-2 text-overline text-ink-muted">Next on {session.track.name}</h2>
              <Link href={`/${org.slug}/${event.slug}/sessions/${nextOnTrack.slug}`} className="block rounded-lg border border-line bg-canvas p-4 transition-colors hover:bg-subtle">
                <span className="block text-sm font-bold text-accent-text">{formatTime(nextOnTrack.effectiveStartDateTime, event.timezone)}</span>
                <span className="mt-1 block text-[16px] font-bold text-ink">{nextOnTrack.title}</span>
                {nextOnTrack.speakers.length > 0 ? <span className="mt-0.5 block text-sm text-ink-muted">{nextOnTrack.speakers.map((item) => item.speaker.name).join(", ")}</span> : null}
              </Link>
            </div>
          ) : null}
          {alsoNow.length > 0 ? (
            <div>
              <h2 className="mb-2 text-overline text-ink-muted">Also at {formatTime(effective.effectiveStartDateTime, event.timezone)}</h2>
              <ul className="flex flex-col gap-2.5">
                {alsoNow.map((item) => (
                  <li key={item.id}>
                    <Link href={`/${org.slug}/${event.slug}/sessions/${item.slug}`} className="block rounded-lg border border-line bg-canvas p-4 transition-colors hover:bg-subtle">
                      <span className="block text-sm font-semibold text-ink-secondary">{item.track.name}</span>
                      <span className="mt-1 block text-[16px] font-bold text-ink">{item.title}</span>
                      {item.speakers.length > 0 ? <span className="mt-0.5 block text-sm text-ink-muted">{item.speakers.map((entry) => entry.speaker.name).join(", ")}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
