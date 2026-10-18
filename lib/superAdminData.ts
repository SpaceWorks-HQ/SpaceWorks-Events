import "server-only";

import { prisma } from "@/lib/db";
import type { DailyRow } from "@/lib/superAdminInsights";

export const ACTIVITY_SERIES = ["signups", "organisations", "events", "rsvps", "checkins", "feedback", "broadcasts"] as const;
export type ActivitySeries = (typeof ACTIVITY_SERIES)[number];

/**
 * Per-day instance activity since `since`, grouped in the database so only
 * one small row per (series, active day) comes back. Counts only; no rows,
 * people, or tokens are read.
 */
export function loadDailyActivity(since: Date) {
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

export const EMAIL_SERIES = ["queued", "sent", "failed"] as const;

/** Per-day outbox volume: messages created, delivered (by sent time), and failed (by creation). */
export function loadDailyEmail(since: Date) {
  return prisma.$queryRaw<DailyRow[]>`
    select 'queued' as series, to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') as day, count(*)::int as n from "OutboxMessage" where "createdAt" >= ${since} group by 2
    union all
    select 'sent', to_char(date_trunc('day', "sentAt"), 'YYYY-MM-DD'), count(*)::int from "OutboxMessage" where "status" = 'SENT' and "sentAt" >= ${since} group by 2
    union all
    select 'failed', to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD'), count(*)::int from "OutboxMessage" where "status" = 'FAILED' and "createdAt" >= ${since} group by 2
  `;
}

/** Organisations with the most registrations created since `since` (event and series occurrences). */
export function loadTopOrganisationsByRsvps(since: Date, limit = 10) {
  return prisma.$queryRaw<Array<{ id: string; name: string; slug: string; rsvps: number }>>`
    select o.id, o.name, o.slug, count(r.id)::int as rsvps
    from "RSVP" r
    left join "Event" e on e.id = r."eventId"
    left join "EventInstance" i on i.id = r."eventInstanceId"
    left join "EventSeries" s on s.id = i."eventSeriesId"
    join "Organisation" o on o.id = coalesce(e."organisationId", s."organisationId")
    where r."createdAt" >= ${since}
    group by o.id, o.name, o.slug
    order by count(r.id) desc
    limit ${limit}
  `;
}

/** Organisations that sent the most broadcasts since `since`, with total recipients. */
export function loadTopOrganisationsByBroadcasts(since: Date, limit = 10) {
  return prisma.$queryRaw<Array<{ id: string; name: string; slug: string; broadcasts: number; recipients: number }>>`
    select o.id, o.name, o.slug, count(b.id)::int as broadcasts, coalesce(sum(b."recipientCount"), 0)::int as recipients
    from "EventBroadcast" b
    join "Event" e on e.id = b."eventId"
    join "Organisation" o on o.id = e."organisationId"
    where b."createdAt" >= ${since}
    group by o.id, o.name, o.slug
    order by count(b.id) desc
    limit ${limit}
  `;
}
