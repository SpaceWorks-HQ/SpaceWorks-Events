import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { DailyRow } from "@/lib/superAdminInsights";

/**
 * A JS Date as a UTC `timestamp without time zone` SQL value.
 *
 * Prisma stores DateTime columns as UTC wall-clock values in `timestamp(3)`
 * columns, but binds raw-query Date parameters as `timestamptz`. Comparing the
 * two makes Postgres reinterpret the column in the session TimeZone, which
 * shifts every window by the server's UTC offset unless the database runs in
 * UTC. Converting the parameter keeps the comparison in UTC and index-friendly.
 */
export function utcTimestamp(value: Date): Prisma.Sql {
  return Prisma.sql`(${value}::timestamptz at time zone 'UTC')`;
}

export type ActivitySeries = (typeof ACTIVITY_SERIES)[number];

/**
 * Per-day instance activity since `since`, grouped in the database so only
 * one small row per (series, active day) comes back. Counts only; no rows,
 * people, or tokens are read.
 */
export function loadDailyActivity(sinceDate: Date) {
  const since = utcTimestamp(sinceDate);
  return prisma.$queryRaw<DailyRow[]>`
    select 'signups' as series, to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') as day, count(*)::int as n from "User" where "createdAt" >= ${since} group by 2
    union all
    select 'organisations', to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD'), count(*)::int from "Organisation" where "createdAt" >= ${since} group by 2
    union all
    select 'events', to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD'), count(*)::int from "Event" where "createdAt" >= ${since} group by 2
    union all
    select 'rsvps', to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD'), count(*)::int from "RSVP" where "createdAt" >= ${since} group by 2
    union all
    select 'checkins', to_char(date_trunc('day', "checkedInAt"), 'YYYY-MM-DD'), count(*)::int from "RSVP" where "checkedInAt" >= ${since} group by 2
    union all
    select 'feedback', to_char(date_trunc('day', "submittedAt"), 'YYYY-MM-DD'), count(*)::int from "EventFeedbackResponse" where "submittedAt" >= ${since} group by 2
    union all
    select 'broadcasts', to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD'), count(*)::int from "EventBroadcast" where "createdAt" >= ${since} group by 2
  `;
}



/** Per-day outbox volume: messages created, delivered (by sent time), and failed (by creation). */
export function loadDailyEmail(sinceDate: Date) {
  const since = utcTimestamp(sinceDate);
  return prisma.$queryRaw<DailyRow[]>`
    select 'queued' as series, to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') as day, count(*)::int as n from "OutboxMessage" where "createdAt" >= ${since} group by 2
    union all
    select 'sent', to_char(date_trunc('day', "sentAt"), 'YYYY-MM-DD'), count(*)::int from "OutboxMessage" where "status" = 'SENT' and "sentAt" >= ${since} group by 2
    union all
    select 'failed', to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD'), count(*)::int from "OutboxMessage" where "status" = 'FAILED' and "createdAt" >= ${since} group by 2
  `;
}

/** Organisations with the most registrations created since `since` (event and series occurrences). */
export function loadTopOrganisationsByRsvps(sinceDate: Date, limit = 10) {
  const since = utcTimestamp(sinceDate);
  return prisma.$queryRaw<Array<{ id: string; name: string; slug: string; rsvps: number; }>>`
    select o.id, o.name, o.slug, count(r.id)::int as rsvps
    from "RSVP" r
    left join "Event" e on e.id = r."eventId"
    left join "EventInstance" i on i.id = r."eventInstanceId"
    left join "EventSeries" s on s.id = i."eventSeriesId"
    join "Organisation" o on o.id = coalesce(e."organisationId", s."organisationId")
    where r."createdAt" >= ${since}
    group by o.id, o.name, o.slug
    order by count(r.id) desc
    limit ${Math.min(Math.max(Math.trunc(limit), 1), 50)}
  `;
}

/** Organisations that sent the most broadcasts since `since`, with total recipients. */
export function loadTopOrganisationsByBroadcasts(sinceDate: Date, limit = 10) {
  const since = utcTimestamp(sinceDate);
  return prisma.$queryRaw<Array<{ id: string; name: string; slug: string; broadcasts: number; recipients: number; }>>`
    select o.id, o.name, o.slug, count(b.id)::int as broadcasts, coalesce(sum(b."recipientCount"), 0)::int as recipients
    from "EventBroadcast" b
    join "Event" e on e.id = b."eventId"
    join "Organisation" o on o.id = e."organisationId"
    where b."createdAt" >= ${since}
    group by o.id, o.name, o.slug
    order by count(b.id) desc
    limit ${Math.min(Math.max(Math.trunc(limit), 1), 50)}
  `;
}

import { ACTIVITY_SERIES } from "./superAdminSeries";
export { ACTIVITY_SERIES, EMAIL_SERIES } from "./superAdminSeries";
