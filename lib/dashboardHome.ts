import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isOrgAdmin } from "@/lib/permissions";
import { dailyCounts, forwardDailyCounts, homeSummary, toDotLevels, weekOverWeek } from "@/lib/dashboardHomeMetrics";
import { DAY_MS, LISTED, LIST_LIMIT, SAMPLE_LIMIT } from "./dashboardHome/constants";
import { displayName, eventSelect, instanceSelect, loadRsvpCounts, toEventRow, toInstanceRow, type EventForRow } from "./dashboardHome/rows";
import { liveEventWhere, loadLiveEvent, loadNextUp } from "./dashboardHome/eventCards";
import type { DashboardHome, HomeActivity, HomeOrganisation, HomeStat } from "./dashboardHome/types";

/*
 * Data for the dashboard home. Everything is scoped to organisations the
 * person belongs to (any role), the same scope the page always had; things
 * that ask for action (approvals, drafts, check-in) only come from
 * organisations they manage (OWNER/ADMIN). Guest emails are never returned.
 */

export type { DashboardHome, HomeActivity, HomeEventRow, HomeLiveEvent, HomeOrganisation, HomeStat } from "./dashboardHome/types";
export { countsFor, eventSelect, instanceSelect, loadRsvpCounts, toEventRow, toInstanceRow, type EventForRow, type InstanceForRow, type RsvpCounts } from "./dashboardHome/rows";
export { liveEventWhere, loadLiveEvent, loadNextUp } from "./dashboardHome/eventCards";

export async function getDashboardHome(userId: string, now = new Date()): Promise<DashboardHome> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    orderBy: { organisation: { name: "asc" } },
    select: { role: true, organisation: { select: { id: true, slug: true, name: true, logoUrl: true } } },
  });
  const orgIds = memberships.map((membership) => membership.organisation.id);
  const adminOrgIds = memberships.filter((membership) => isOrgAdmin(membership.role)).map((membership) => membership.organisation.id);
  const adminOrganisations = memberships.filter((membership) => isOrgAdmin(membership.role)).map((membership) => ({ slug: membership.organisation.slug, name: membership.organisation.name }));

  const memberEvent = { organisationId: { in: orgIds } } satisfies Prisma.EventWhereInput;
  const memberRsvp = {
    OR: [{ event: { organisationId: { in: orgIds } } }, { eventInstance: { series: { organisationId: { in: orgIds } } } }],
  } satisfies Prisma.RSVPWhereInput;
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);
  const dayAgo = new Date(now.getTime() - DAY_MS);

  const [
    upcomingEvents,
    upcomingInstances,
    draftEvents,
    pastEvents,
    upcomingEventCount,
    upcomingInstanceCount,
    draftCount,
    pendingRsvps,
    signupDates,
    signupsPrevWeek,
    checkInDates,
    checkInsPrevWeek,
    feedbackDates,
    feedbackPrevWeek,
    recentRsvps,
    recentCheckIns,
    recentFeedback,
    liveCandidate,
    upcomingByOrg,
    membersByOrg,
    anyEvent,
    anyPublished,
    weekAheadEvents,
    weekAheadInstances,
  ] = await Promise.all([
    prisma.event.findMany({ where: { ...memberEvent, status: { in: LISTED }, endDateTime: { gte: now } }, orderBy: { startDateTime: "asc" }, take: LIST_LIMIT, select: eventSelect }),
    prisma.eventInstance.findMany({
      where: { endDateTime: { gte: now }, series: { organisationId: { in: orgIds }, status: { in: LISTED } } },
      orderBy: { startDateTime: "asc" },
      take: LIST_LIMIT,
      select: instanceSelect,
    }),
    prisma.event.findMany({ where: { organisationId: { in: adminOrgIds }, status: "DRAFT" }, orderBy: { createdAt: "desc" }, take: LIST_LIMIT, select: eventSelect }),
    prisma.event.findMany({ where: { ...memberEvent, status: { in: LISTED }, endDateTime: { lt: now } }, orderBy: { startDateTime: "desc" }, take: LIST_LIMIT, select: eventSelect }),
    prisma.event.count({ where: { ...memberEvent, status: { in: LISTED }, endDateTime: { gte: now } } }),
    prisma.eventInstance.count({ where: { endDateTime: { gte: now }, series: { organisationId: { in: orgIds }, status: { in: LISTED } } } }),
    prisma.event.count({ where: { organisationId: { in: adminOrgIds }, status: "DRAFT" } }),
    prisma.rSVP.findMany({
      where: {
        status: "PENDING_APPROVAL",
        OR: [
          { event: { organisationId: { in: adminOrgIds }, endDateTime: { gte: now } } },
          { eventInstance: { endDateTime: { gte: now }, series: { organisationId: { in: adminOrgIds } } } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: { event: { select: { id: true, organisation: { select: { slug: true } } } }, eventInstance: { select: { series: { select: { id: true, organisation: { select: { slug: true } } } } } } },
    }),
    prisma.rSVP.findMany({ where: { ...memberRsvp, createdAt: { gte: weekAgo } }, select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: SAMPLE_LIMIT }),
    prisma.rSVP.count({ where: { ...memberRsvp, createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    prisma.rSVP.findMany({ where: { ...memberRsvp, checkedInAt: { gte: weekAgo } }, select: { checkedInAt: true }, orderBy: { checkedInAt: "desc" }, take: SAMPLE_LIMIT }),
    prisma.rSVP.count({ where: { ...memberRsvp, checkedInAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    prisma.eventFeedbackResponse.findMany({ where: { submittedAt: { gte: weekAgo }, form: { event: memberEvent } }, select: { submittedAt: true }, orderBy: { submittedAt: "desc" }, take: SAMPLE_LIMIT }),
    prisma.eventFeedbackResponse.count({ where: { submittedAt: { gte: twoWeeksAgo, lt: weekAgo }, form: { event: memberEvent } } }),
    prisma.rSVP.findMany({
      where: memberRsvp,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, status: true, createdAt: true, guestName: true, user: { select: { name: true } }, event: { select: { title: true, timezone: true } }, eventInstance: { select: { series: { select: { title: true, timezone: true } } } } },
    }),
    prisma.rSVP.findMany({
      where: { ...memberRsvp, checkedInAt: { not: null } },
      orderBy: { checkedInAt: "desc" },
      take: 8,
      select: { id: true, checkedInAt: true, guestName: true, user: { select: { name: true } }, event: { select: { title: true, timezone: true } }, eventInstance: { select: { series: { select: { title: true, timezone: true } } } } },
    }),
    prisma.eventFeedbackResponse.findMany({
      where: { form: { event: memberEvent } },
      orderBy: { submittedAt: "desc" },
      take: 8,
      select: { id: true, submittedAt: true, rsvp: { select: { guestName: true, user: { select: { name: true } } } }, form: { select: { event: { select: { title: true, timezone: true } } } } },
    }),
    prisma.event.findFirst({
      where: liveEventWhere(memberEvent, now),
      orderBy: { startDateTime: "asc" },
      select: eventSelect,
    }),
    prisma.event.groupBy({ by: ["organisationId"], where: { ...memberEvent, status: { in: LISTED }, endDateTime: { gte: now } }, _count: { _all: true } }),
    prisma.membership.groupBy({ by: ["organisationId"], where: { organisationId: { in: orgIds } }, _count: { _all: true } }),
    prisma.event.findFirst({ where: memberEvent, select: { id: true } }),
    prisma.event.findFirst({ where: { ...memberEvent, status: { in: LISTED } }, select: { id: true } }),
    prisma.event.findMany({ where: { ...memberEvent, status: { in: LISTED }, startDateTime: { gte: now, lt: new Date(now.getTime() + 7 * DAY_MS) } }, select: { startDateTime: true }, take: 500 }),
    prisma.eventInstance.findMany({ where: { startDateTime: { gte: now, lt: new Date(now.getTime() + 7 * DAY_MS) }, series: { organisationId: { in: orgIds }, status: { in: LISTED } } }, select: { startDateTime: true }, take: 500 }),
  ]);

  // RSVP counts for every event and series date shown in a list.
  const counts = await loadRsvpCounts(
    [...upcomingEvents, ...draftEvents, ...pastEvents].map((event) => event.id),
    upcomingInstances.map((instance) => instance.id),
  );
  const manages = (organisationId: string) => adminOrgIds.includes(organisationId);
  const eventRow = (event: EventForRow) => toEventRow(event, counts, manages(event.organisationId));

  const upcoming = [...upcomingEvents.map(eventRow), ...upcomingInstances.map((instance) => toInstanceRow(instance, counts, manages(instance.series.organisationId)))]
    .sort((a, b) => a.dateBlock.start.getTime() - b.dateBlock.start.getTime())
    .slice(0, LIST_LIMIT);

  // Next up: the soonest one-off event (series dates stay in the list).
  const nextEvent = upcomingEvents.find((event) => event.startDateTime > now) ?? null;
  const next = nextEvent ? await loadNextUp(nextEvent, counts, adminOrgIds.includes(nextEvent.organisationId), now) : null;

  // Event-day mode.
  const live = liveCandidate ? await loadLiveEvent(liveCandidate, adminOrgIds.includes(liveCandidate.organisationId), now) : null;

  // Needs you (managers only).
  const pendingApprovals = pendingRsvps.length;
  const firstPending = pendingRsvps[0];
  const approvalsHref = firstPending?.event
    ? `/dashboard/${firstPending.event.organisation.slug}/event/${firstPending.event.id}`
    : firstPending?.eventInstance
      ? `/dashboard/${firstPending.eventInstance.series.organisation.slug}/series/${firstPending.eventInstance.series.id}`
      : null;
  const firstDraft = draftEvents[0];
  const needsYou = pendingApprovals > 0 || draftCount > 0
    ? { pendingApprovals, approvalsHref, drafts: draftCount, draftHref: firstDraft ? `/dashboard/${firstDraft.organisation.slug}/event/${firstDraft.id}` : null }
    : null;

  // Weekly stats.
  const signupsWeek = dailyCounts(signupDates.map((rsvp) => rsvp.createdAt), now);
  const checkInsWeek = dailyCounts(checkInDates.flatMap((rsvp) => (rsvp.checkedInAt ? [rsvp.checkedInAt] : [])), now);
  const feedbackWeek = dailyCounts(feedbackDates.map((response) => response.submittedAt), now);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const upcomingTotal = upcomingEventCount + upcomingInstanceCount;
  const nextAny = upcoming[0];
  const stats: HomeStat[] = [
    {
      label: "Upcoming events",
      value: upcomingTotal,
      hint: nextAny ? `Next: ${nextAny.title}` : "Nothing scheduled yet",
      // Dots look ahead: one column per day for the next week.
      levels: toDotLevels(forwardDailyCounts([...weekAheadEvents, ...weekAheadInstances].map((item) => item.startDateTime), now)),
      tone: "ink",
    },
    { label: "Sign-ups this week", value: sum(signupsWeek), hint: weekOverWeek(sum(signupsWeek), signupsPrevWeek) ?? "No sign-ups yet", levels: toDotLevels(signupsWeek), tone: "marigold" },
    { label: "Check-ins this week", value: sum(checkInsWeek), hint: weekOverWeek(sum(checkInsWeek), checkInsPrevWeek) ?? "No check-ins yet", levels: toDotLevels(checkInsWeek), tone: "success" },
    { label: "Feedback this week", value: sum(feedbackWeek), hint: weekOverWeek(sum(feedbackWeek), feedbackPrevWeek) ?? "No responses yet", levels: toDotLevels(feedbackWeek), tone: "amber" },
  ];

  // Activity: sign-ups, check-ins and feedback, newest first.
  const activity: HomeActivity[] = [
    ...recentRsvps.map((rsvp) => ({
      key: `rsvp-${rsvp.id}`,
      kind: (rsvp.status === "WAITLISTED" ? "waitlisted" : rsvp.status === "PENDING_APPROVAL" ? "pending" : "registered") as HomeActivity["kind"],
      who: displayName(rsvp),
      eventTitle: rsvp.event?.title ?? rsvp.eventInstance?.series.title ?? "Event",
      at: rsvp.createdAt,
      timezone: rsvp.event?.timezone ?? rsvp.eventInstance?.series.timezone ?? "UTC",
    })),
    ...recentCheckIns.map((rsvp) => ({
      key: `checkin-${rsvp.id}`,
      kind: "checkedIn" as const,
      who: displayName(rsvp),
      eventTitle: rsvp.event?.title ?? rsvp.eventInstance?.series.title ?? "Event",
      at: rsvp.checkedInAt as Date,
      timezone: rsvp.event?.timezone ?? rsvp.eventInstance?.series.timezone ?? "UTC",
    })),
    ...recentFeedback.map((response) => ({
      key: `feedback-${response.id}`,
      kind: "feedback" as const,
      who: response.rsvp ? displayName(response.rsvp) : "A guest",
      eventTitle: response.form.event.title,
      at: response.submittedAt,
      timezone: response.form.event.timezone,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8);

  const upcomingCount = new Map(upcomingByOrg.map((group) => [group.organisationId, group._count._all]));
  const memberCount = new Map(membersByOrg.map((group) => [group.organisationId, group._count._all]));
  const organisations: HomeOrganisation[] = memberships.map(({ role, organisation }) => ({
    ...organisation,
    role: role === "OWNER" ? "Owner" : role === "ADMIN" ? "Admin" : "Member",
    upcoming: upcomingCount.get(organisation.id) ?? 0,
    members: memberCount.get(organisation.id) ?? 0,
  }));

  // First run: shown until the person has a published event.
  const setupDone = Boolean(anyPublished);
  const canSetUp = memberships.length === 0 || adminOrgIds.length > 0;
  const setup = !setupDone && canSetUp
    ? {
        hasOrganisation: memberships.length > 0,
        hasLogo: memberships.some((membership) => isOrgAdmin(membership.role) && membership.organisation.logoUrl),
        hasEvent: Boolean(anyEvent),
        hasPublished: false,
        firstAdminSlug: adminOrganisations[0]?.slug ?? null,
      }
    : null;

  const signupsLastDay = signupDates.filter((rsvp) => rsvp.createdAt >= dayAgo).length;
  const summary = homeSummary({
    live: live ? { title: live.title } : null,
    next: nextAny ? { title: nextAny.title, startDateTime: nextAny.dateBlock.start, timezone: nextAny.dateBlock.timezone } : null,
    signupsLastDay,
    now,
  });

  return {
    summary,
    mood: live ? "cheering" : upcomingTotal > 0 ? "happy" : "sleepy",
    organisations,
    adminOrganisations,
    needsYou,
    next,
    stats,
    upcoming,
    drafts: draftEvents.map(eventRow),
    past: pastEvents.map(eventRow),
    counts: { upcoming: upcomingTotal, drafts: draftCount },
    activity,
    live,
    setup,
  };
}

/** Pending approvals per organisation the person manages, for the sidebar badges. */
export async function getPendingApprovalsByOrg(adminOrgIds: string[], now = new Date()): Promise<Map<string, number>> {
  if (adminOrgIds.length === 0) return new Map();
  const [events, instances] = await Promise.all([
    prisma.event.findMany({
      where: { organisationId: { in: adminOrgIds }, endDateTime: { gte: now }, rsvps: { some: { status: "PENDING_APPROVAL" } } },
      select: { organisationId: true, _count: { select: { rsvps: { where: { status: "PENDING_APPROVAL" } } } } },
      take: 500,
    }),
    prisma.eventInstance.findMany({
      where: { endDateTime: { gte: now }, series: { organisationId: { in: adminOrgIds } }, rsvps: { some: { status: "PENDING_APPROVAL" } } },
      select: { series: { select: { organisationId: true } }, _count: { select: { rsvps: { where: { status: "PENDING_APPROVAL" } } } } },
      take: 500,
    }),
  ]);
  const totals = new Map<string, number>();
  for (const event of events) totals.set(event.organisationId, (totals.get(event.organisationId) ?? 0) + event._count.rsvps);
  for (const instance of instances) totals.set(instance.series.organisationId, (totals.get(instance.series.organisationId) ?? 0) + instance._count.rsvps);
  return totals;
}
