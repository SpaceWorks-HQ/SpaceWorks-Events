import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMembership } from "@/lib/permissions";
import { OrgEventsContainer } from "@/components/org/OrgEventsContainer";
import { CopyOrganisationUrl } from "@/components/org/CopyOrganisationUrl";
import { EventPrivacyType, EventStatus } from "@prisma/client";
import { publicOrgEventSelect, publicOrgInstanceSelect } from "@/lib/publicOrgEventDto";
import { Button } from "@/components/ui/button";
import { Callout, Chip, EmptyState, OrgLogo } from "@/components/ui/display";

import type { Metadata } from "next";
import { listedEventAudienceWhere } from "@/lib/eventVisibility";
import { resolveShortLinkSegment } from "@/lib/shortLinkResolve";

type Props = { params: Promise<{ orgSlug: string }> };
const PUBLIC_COLLECTION_LIMIT = 250;
const PUBLIC_HISTORY_MS = 365 * 24 * 60 * 60_000;
const PUBLIC_FUTURE_MS = 2 * 365 * 24 * 60 * 60_000;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug } = await params;
  const org = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
    select: { name: true, description: true },
  });
  if (!org) return { title: "Organisation" };
  const description =
    org.description?.slice(0, 160) || `Events by ${org.name}`;
  return {
    title: org.name,
    description,
    openGraph: { title: org.name, description },
  };
}

export default async function OrganisationPage({ params }: Props) {
  const { orgSlug } = await params;
  const org = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      _count: { select: { memberships: true } },
    },
  });
  if (!org) {
    // Layout and page render in parallel; share the layout's memoised
    // short-link decision so this page can never 404 ahead of its redirect.
    const destination = await resolveShortLinkSegment(orgSlug);
    if (destination) redirect(destination);
    notFound();
  }

  const session = await auth();
  const now = new Date();
  const windowStart = new Date(now.getTime() - PUBLIC_HISTORY_MS);
  const windowEnd = new Date(now.getTime() + PUBLIC_FUTURE_MS);

  // Only published events with a listed audience belong on an organisation's
  // public listing: fully public, or approval-required with listing turned on.
  // Hidden-link, unlisted approval and invite-only events stay reachable only
  // through their intended access paths.
  const eventQuery = prisma.event.findMany({
    where: {
      organisationId: org.id,
      status: EventStatus.PUBLISHED,
      AND: listedEventAudienceWhere,
      page: { is: { isPublished: true } },
      endDateTime: { gte: windowStart },
      startDateTime: { lte: windowEnd },
    },
    select: publicOrgEventSelect,
    orderBy: { createdAt: "desc" },
    take: PUBLIC_COLLECTION_LIMIT + 1,
  });

  // Apply the same visibility boundary to recurring-series instances.
  const instanceQuery = prisma.eventInstance.findMany({
    where: {
      series: {
        organisationId: org.id,
        status: EventStatus.PUBLISHED,
        privacyType: EventPrivacyType.PUBLIC,
      },
      endDateTime: { gte: windowStart },
      startDateTime: { lte: windowEnd },
    },
    select: publicOrgInstanceSelect,
    orderBy: { startDateTime: "asc" },
    take: PUBLIC_COLLECTION_LIMIT + 1,
  });
  const [membership, events, instances] = await Promise.all([
    session?.user?.id ? getMembership(session.user.id, org.id) : Promise.resolve(null),
    eventQuery,
    instanceQuery,
  ]);
  const collectionTruncated = events.length > PUBLIC_COLLECTION_LIMIT || instances.length > PUBLIC_COLLECTION_LIMIT;
  const visibleEvents = events.slice(0, PUBLIC_COLLECTION_LIMIT);
  const visibleInstances = instances.slice(0, PUBLIC_COLLECTION_LIMIT);

  // Merge events and instances into one newest-created-first list. A recurring
  // occurrence represents its series for ordering purposes, not the time its
  // materialized instance row happened to be generated.
  const merged = [
    ...visibleEvents.map((event) => ({
      kind: "event" as const,
      id: `e-${event.id}`,
      createdAt: event.createdAt,
      startDateTime: event.startDateTime,
      endDateTime: event.endDateTime,
      title: event.title,
      description: event.description,
      event,
    })),
    ...visibleInstances.map((instance) => ({
      kind: "instance" as const,
      id: `i-${instance.id}`,
      createdAt: instance.series.createdAt,
      startDateTime: instance.startDateTime,
      endDateTime: instance.endDateTime,
      title: instance.series.title,
      description: instance.series.description,
      instance,
    })),
  ];

  merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Count upcoming occurrences
  const upcomingCount = merged.filter((item) => item.startDateTime >= now).length;

  // Confirmed counts only for events whose organiser shows registration counts publicly.
  const countedEventIds = visibleEvents.filter((event) => event.showRegistrationCount).map((event) => event.id);
  const goingRows = countedEventIds.length > 0
    ? await prisma.rSVP.groupBy({ by: ["eventId"], where: { eventId: { in: countedEventIds }, status: "CONFIRMED" }, _count: { _all: true } })
    : [];
  const goingCounts = Object.fromEntries(goingRows.flatMap((row) => (row.eventId ? [[row.eventId, row._count._all]] : [])));

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-7">
        <OrgLogo name={org.name} src={org.logoUrl} size="xl" className="size-20 rounded-[22px] text-2xl sm:size-28 sm:rounded-[28px] sm:text-4xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-display-m min-w-0 break-words text-ink">{org.name}</h1>
            {membership ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/dashboard/${org.slug}`}>Dashboard</Link>
              </Button>
            ) : null}
          </div>
          <p className="max-w-[640px] text-body-l text-ink-secondary">
            {org.description || "Community, events, and updates—check back soon for what’s next."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {upcomingCount > 0 ? <Chip className="bg-tint-peach text-warning-fg">{upcomingCount} upcoming</Chip> : null}
            {merged.length > 0 ? <Chip>{merged.length} {merged.length === 1 ? "event" : "events"} hosted</Chip> : null}
            <CopyOrganisationUrl slug={org.slug} />
          </div>
        </div>
      </header>

      <section id="events-list" aria-label="Events" className="flex flex-col gap-4">
        {collectionTruncated ? <Callout tone="info">Showing the first {PUBLIC_COLLECTION_LIMIT} standalone events and recurring dates in the public three-year window. Use event links or the organiser dashboard for older records.</Callout> : null}
        {merged.length === 0 ? (
          <EmptyState
            title="No events scheduled yet"
            action={membership ? <Button asChild variant="primary"><Link href={`/dashboard/${org.slug}`}>Create your first event</Link></Button> : undefined}
          >
            This community hasn&apos;t published any events or recurring series yet. Check back soon!
          </EmptyState>
        ) : (
          <OrgEventsContainer
            orgSlug={org.slug}
            organisationName={org.name}
            initialNow={now.toISOString()}
            items={merged}
            goingCounts={goingCounts}
          />
        )}
      </section>
    </div>
  );
}
