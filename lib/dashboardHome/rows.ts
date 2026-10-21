import "server-only";

import type { Prisma, RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAccentTokens } from "@/lib/theme/accent";
import { eventFillStatus } from "@/lib/dashboardHomeMetrics";
import type { HomeEventRow } from "./types";

export function displayName(rsvp: { guestName: string | null; user: { name: string | null } | null }) {
  return rsvp.user?.name?.trim() || rsvp.guestName?.trim() || "A guest";
}

export function firstName(name: string) {
  return name === "A guest" ? name : name.split(/\s+/)[0];
}

function accentOf(value: string | null | undefined) {
  return getAccentTokens(value, "light")["--yy-accent"];
}

type CountKey = { eventId?: string | null; eventInstanceId?: string | null; status: RsvpStatus; _count: { _all: number } };

function tally(groups: CountKey[], key: "eventId" | "eventInstanceId") {
  const map = new Map<string, { confirmed: number; waitlisted: number; pending: number }>();
  for (const group of groups) {
    const id = group[key];
    if (!id) continue;
    const entry = map.get(id) ?? { confirmed: 0, waitlisted: 0, pending: 0 };
    if (group.status === "CONFIRMED") entry.confirmed += group._count._all;
    if (group.status === "WAITLISTED") entry.waitlisted += group._count._all;
    if (group.status === "PENDING_APPROVAL") entry.pending += group._count._all;
    map.set(id, entry);
  }
  return map;
}

export const eventSelect = {
  id: true,
  organisationId: true,
  title: true,
  slug: true,
  startDateTime: true,
  endDateTime: true,
  timezone: true,
  location: true,
  isOnline: true,
  capacity: true,
  status: true,
  organisation: { select: { slug: true, name: true } },
  page: { select: { accentColor: true } },
} satisfies Prisma.EventSelect;

export type EventForRow = Prisma.EventGetPayload<{ select: typeof eventSelect }>;

export type RsvpCounts = { event: Map<string, CountTriple>; instance: Map<string, CountTriple> };
type CountTriple = { confirmed: number; waitlisted: number; pending: number };
const EMPTY_COUNTS: CountTriple = { confirmed: 0, waitlisted: 0, pending: 0 };

/** Confirmed / waitlisted / pending counts for the listed events and series dates. */
export async function loadRsvpCounts(eventIds: string[], instanceIds: string[]): Promise<RsvpCounts> {
  const uniqueEvents = [...new Set(eventIds)];
  const [eventGroups, instanceGroups] = await Promise.all([
    uniqueEvents.length ? prisma.rSVP.groupBy({ by: ["eventId", "status"], where: { eventId: { in: uniqueEvents } }, _count: { _all: true } }) : Promise.resolve([]),
    instanceIds.length ? prisma.rSVP.groupBy({ by: ["eventInstanceId", "status"], where: { eventInstanceId: { in: instanceIds } }, _count: { _all: true } }) : Promise.resolve([]),
  ]);
  return { event: tally(eventGroups, "eventId"), instance: tally(instanceGroups, "eventInstanceId") };
}

export function countsFor(counts: RsvpCounts, eventId: string): CountTriple {
  return counts.event.get(eventId) ?? EMPTY_COUNTS;
}

/**
 * One event row. `canManage` must reflect the person's role in the event's
 * organisation: without it there is no management link and pending
 * approvals are not revealed.
 */
export function toEventRow(event: EventForRow, counts: RsvpCounts, canManage: boolean): HomeEventRow {
  const all = countsFor(counts, event.id);
  const tallies = canManage ? all : { ...all, pending: 0 };
  const draft = event.status === "DRAFT";
  return {
    key: `event-${event.id}`,
    href: canManage ? `/dashboard/${event.organisation.slug}/event/${event.id}` : null,
    title: event.title,
    organisationName: event.organisation.name,
    dateBlock: { start: event.startDateTime, timezone: event.timezone },
    meta: event.isOnline ? "Online" : event.location || "Venue to be confirmed",
    accent: accentOf(event.page?.accentColor),
    isSeries: false,
    isDraft: draft,
    status: draft ? { label: "Finish & publish", tone: "warning" } : eventFillStatus(tallies, event.capacity),
    fill: !draft && event.capacity ? { filled: tallies.confirmed, total: event.capacity } : null,
  };
}

export const instanceSelect = {
  id: true,
  startDateTime: true,
  series: { select: { id: true, organisationId: true, title: true, timezone: true, capacity: true, organisation: { select: { slug: true, name: true } } } },
} satisfies Prisma.EventInstanceSelect;

export type InstanceForRow = Prisma.EventInstanceGetPayload<{ select: typeof instanceSelect }>;

export function toInstanceRow(instance: InstanceForRow, counts: RsvpCounts, canManage: boolean): HomeEventRow {
  const all = counts.instance.get(instance.id) ?? EMPTY_COUNTS;
  const tallies = canManage ? all : { ...all, pending: 0 };
  return {
    key: `instance-${instance.id}`,
    href: canManage ? `/dashboard/${instance.series.organisation.slug}/series/${instance.series.id}` : null,
    title: instance.series.title,
    organisationName: instance.series.organisation.name,
    dateBlock: { start: instance.startDateTime, timezone: instance.series.timezone },
    meta: "Series date",
    accent: accentOf(null),
    isSeries: true,
    isDraft: false,
    status: eventFillStatus(tallies, instance.series.capacity),
    fill: instance.series.capacity ? { filled: tallies.confirmed, total: instance.series.capacity } : null,
  };
}
