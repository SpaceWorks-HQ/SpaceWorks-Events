import { EventPrivacyType, EventStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { eventForView } from "@/lib/frontend/eventView";
import { parseDiscoveryDateRange } from "@/lib/dateFilter";
import { listedEventAudienceWhere } from "@/lib/eventVisibility";
const PAGE_SIZE = 12;
const MAX_DISCOVERY_PAGES = 100;
const MAX_QUERY_LENGTH = 120;
type SearchParams = Promise<{
  sort?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: string;
}>;
function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function datePresets(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 6));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  return {
    week: { from: isoDay(today), to: isoDay(weekEnd) },
    month: { from: isoDay(today), to: isoDay(monthEnd) },
  };
}

function buildQueryString(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
export async function loadDiscoverView({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const session = await auth();
  const getStartedHref = session?.user ? "/dashboard" : "/login";
  const sort = sp.sort === "popular" ? "popular" : "upcoming";
  const q = (sp.q?.trim() || "").slice(0, MAX_QUERY_LENGTH);
  const page = Math.min(MAX_DISCOVERY_PAGES, Math.max(1, parseInt(sp.page ?? "1", 10) || 1));
  const { fromDate, toExclusive, error: dateRangeError } = parseDiscoveryDateRange(sp.from, sp.to);
  const eventWhere = {
    status: EventStatus.PUBLISHED,
    AND: listedEventAudienceWhere,
    page: { is: { isPublished: true } },
    endDateTime: { gte: new Date() },
    ...(q
      ? {
        OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { description: { contains: q, mode: "insensitive" as const } },
          { tags: { has: q.toLowerCase() } },
          { organisation: { name: { contains: q, mode: "insensitive" as const } } },
        ],
      }
      : {}),
    ...(!dateRangeError && (fromDate || toExclusive) && {
      startDateTime: {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toExclusive ? { lt: toExclusive } : {}),
      },
    }),
  } as const;
  const instanceWhere = {
    series: {
      status: EventStatus.PUBLISHED,
      privacyType: EventPrivacyType.PUBLIC,
      ...(q
        ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
            { organisation: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
        : {}),
    },
    endDateTime: { gte: new Date() },
    ...(!dateRangeError && (fromDate || toExclusive) && {
      startDateTime: {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toExclusive ? { lt: toExclusive } : {}),
      },
    }),
  };
  const [eventCount, instanceCount] = await Promise.all([
    prisma.event.count({ where: eventWhere }),
    prisma.eventInstance.count({ where: instanceWhere }),
  ]);
  const totalItems = eventCount + instanceCount;
  const totalPages = Math.min(MAX_DISCOVERY_PAGES, Math.max(1, Math.ceil(totalItems / PAGE_SIZE)));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const validFrom = dateRangeError ? null : fromDate;
  const validToExclusive = dateRangeError ? null : toExclusive;
  const searchPattern = `%${q}%`;
  const utc = (date: Date) => Prisma.sql`(${date}::timestamptz AT TIME ZONE 'UTC')`;
  const now = new Date();
  const eventFilters = [
    Prisma.sql`e."status" = ${EventStatus.PUBLISHED}::"EventStatus"`,
    Prisma.sql`(e."privacyType" = ${EventPrivacyType.PUBLIC}::"EventPrivacyType" OR (e."privacyType" = ${EventPrivacyType.APPROVAL_REQUIRED}::"EventPrivacyType" AND e."listedPublicly" = TRUE))`,
    Prisma.sql`EXISTS (SELECT 1 FROM "EventPage" ep WHERE ep."eventId" = e."id" AND ep."isPublished" = TRUE)`,
    Prisma.sql`e."endDateTime" >= ${utc(now)}`,
    ...(q ? [Prisma.sql`(e."title" ILIKE ${searchPattern} OR e."description" ILIKE ${searchPattern} OR ${q.toLowerCase()} = ANY(e."tags") OR EXISTS (SELECT 1 FROM "Organisation" o WHERE o."id" = e."organisationId" AND o."name" ILIKE ${searchPattern}))`] : []),
    ...(validFrom ? [Prisma.sql`e."startDateTime" >= ${utc(validFrom)}`] : []),
    ...(validToExclusive ? [Prisma.sql`e."startDateTime" < ${utc(validToExclusive)}`] : []),
  ];
  const instanceFilters = [
    Prisma.sql`s."status" = ${EventStatus.PUBLISHED}::"EventStatus"`,
    Prisma.sql`s."privacyType" = ${EventPrivacyType.PUBLIC}::"EventPrivacyType"`,
    Prisma.sql`i."endDateTime" >= ${utc(now)}`,
    ...(q ? [Prisma.sql`(s."title" ILIKE ${searchPattern} OR s."description" ILIKE ${searchPattern} OR EXISTS (SELECT 1 FROM "Organisation" o WHERE o."id" = s."organisationId" AND o."name" ILIKE ${searchPattern}))`] : []),
    ...(validFrom ? [Prisma.sql`i."startDateTime" >= ${utc(validFrom)}`] : []),
    ...(validToExclusive ? [Prisma.sql`i."startDateTime" < ${utc(validToExclusive)}`] : []),
  ];
  const ordering = sort === "popular"
    ? Prisma.sql`"popularity" DESC, "startDateTime" ASC, "id" ASC`
    : Prisma.sql`"startDateTime" ASC, "id" ASC`;
  const indexRows = await prisma.$queryRaw<Array<{ kind: "event" | "instance"; id: string; }>>(Prisma.sql`
    WITH candidates AS (
      SELECT 'event'::text AS "kind", e."id", e."startDateTime",
        (SELECT COUNT(*)::int FROM "RSVP" r WHERE r."eventId" = e."id" AND r."status" = 'CONFIRMED'::"RsvpStatus") AS "popularity"
      FROM "Event" e
      WHERE ${Prisma.join(eventFilters, " AND ")}
      UNION ALL
      SELECT 'instance'::text AS "kind", i."id", i."startDateTime",
        (SELECT COUNT(*)::int FROM "RSVP" r WHERE r."eventInstanceId" = i."id" AND r."status" = 'CONFIRMED'::"RsvpStatus") AS "popularity"
      FROM "EventInstance" i
      INNER JOIN "EventSeries" s ON s."id" = i."eventSeriesId"
      WHERE ${Prisma.join(instanceFilters, " AND ")}
    )
    SELECT "kind", "id" FROM candidates
    ORDER BY ${ordering}
    LIMIT ${PAGE_SIZE} OFFSET ${startIdx}
  `);
  const eventIds = indexRows.filter((row) => row.kind === "event").map((row) => row.id);
  const instanceIds = indexRows.filter((row) => row.kind === "instance").map((row) => row.id);
  const [events, instances] = await Promise.all([
    prisma.event.findMany({ where: { id: { in: eventIds } }, include: { organisation: { select: { slug: true, name: true } }, page: { select: { accentColor: true } } } }).then((rows) => rows.map(eventForView)),
    prisma.eventInstance.findMany({ where: { id: { in: instanceIds } }, include: { series: { include: { organisation: { select: { slug: true, name: true } } } } } }),
  ]);
  const countedEventIds = events.filter((event) => event.showRegistrationCount).map((event) => event.id);
  const goingRows = countedEventIds.length > 0
    ? await prisma.rSVP.groupBy({ by: ["eventId"], where: { eventId: { in: countedEventIds }, status: "CONFIRMED" }, _count: { _all: true } })
    : [];
  const goingByEvent = new Map(goingRows.map((row) => [row.eventId, row._count._all]));
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const instancesById = new Map(instances.map((instance) => [instance.id, instance]));
  type PageItem =
    | { kind: "event"; id: string; orgSlug: string; event: (typeof events)[number]; }
    | { kind: "instance"; id: string; orgSlug: string; instance: (typeof instances)[number]; };
  const pageItems: PageItem[] = [];
  for (const row of indexRows) {
    if (row.kind === "event") {
      const event = eventsById.get(row.id);
      if (event) pageItems.push({ kind: "event", id: `e-${event.id}`, orgSlug: event.organisation.slug, event });
      continue;
    }
    const instance = instancesById.get(row.id);
    if (instance) pageItems.push({ kind: "instance", id: `i-${instance.id}`, orgSlug: instance.series.organisation.slug, instance });
  }
  const hasActiveFilters = q || sp.from || sp.to || sort !== "upcoming";
  const clearSearchHref = `/discover${buildQueryString({ ...(sort !== "upcoming" ? { sort } : {}), ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}) })}`;
  const presets = datePresets();
  const rangeHref = (range: { from: string; to: string; } | null) => `/discover${buildQueryString({ ...(q ? { q } : {}), ...(sort !== "upcoming" ? { sort } : {}), ...(range ? { from: range.from, to: range.to } : {}) })}`;
  const activeRange = !sp.from && !sp.to
    ? "all"
    : sp.from === presets.week.from && sp.to === presets.week.to
      ? "week"
      : sp.from === presets.month.from && sp.to === presets.month.to
        ? "month"
        : "custom";
  const dateChips = [
    { key: "all", label: "All", href: rangeHref(null) },
    { key: "week", label: "This week", href: rangeHref(presets.week) },
    { key: "month", label: "This month", href: rangeHref(presets.month) },
  ] as const;
  const resultsLabel = q
    ? `${totalItems} ${totalItems === 1 ? "event matches" : "events match"} “${q}”`
    : sort === "popular" ? "Popular events" : "Upcoming events";
  return { sort, q, clearSearchHref, dateChips, activeRange, dateRangeError, sp, resultsLabel, totalItems, startIdx, pageItems, hasActiveFilters, goingByEvent, totalPages, safePage, getStartedHref };
}
