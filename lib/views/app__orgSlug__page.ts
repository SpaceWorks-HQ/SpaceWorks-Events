import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMembership } from "@/lib/permissions";
import { EventPrivacyType, EventStatus } from "@prisma/client";
import { publicOrgEventSelect, publicOrgInstanceSelect } from "@/lib/publicOrgEventDto";
import type { Metadata } from "next";
import { listedEventAudienceWhere } from "@/lib/eventVisibility";
import { resolveShortLinkSegment } from "@/lib/shortLinkResolve";
type Props = { params: Promise<{ orgSlug: string; }>; };
const PUBLIC_COLLECTION_LIMIT = 250;
const PUBLIC_HISTORY_MS = 365 * 24 * 60 * 60_000;
const PUBLIC_FUTURE_MS = 2 * 365 * 24 * 60 * 60_000;
export async function loadRouteMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug } = await params;
  const org = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
    select: { name: true, description: true },
  });
  if (!org) return { title: "Page not found" };
  const description =
    org.description?.slice(0, 160) || `Events by ${org.name}`;
  return {
    title: org.name,
    description,
    openGraph: { title: org.name, description },
  };
}
export async function loadOrganisationView({ params }: Props) {
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
  const upcomingCount = merged.filter((item) => item.startDateTime >= now).length;
  const countedEventIds = visibleEvents.filter((event) => event.showRegistrationCount).map((event) => event.id);
  const goingRows = countedEventIds.length > 0
    ? await prisma.rSVP.groupBy({ by: ["eventId"], where: { eventId: { in: countedEventIds }, status: "CONFIRMED" }, _count: { _all: true } })
    : [];
  const goingCounts = Object.fromEntries(goingRows.flatMap((row) => (row.eventId ? [[row.eventId, row._count._all]] : [])));
  return { org, membership, upcomingCount, merged, collectionTruncated, now, goingCounts };
}
