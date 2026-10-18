import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { loadRsvpStatusCounts } from "@/lib/eventDashboard/data";
import { loadAllSignupDates, loadFeedbackCount } from "@/lib/eventDashboard/overview";
import { type MixPart } from "@/components/event-dashboard/analytics/AnalyticsSections";
import { busiestDay, capacityStatus, funnelSentence, funnelSteps, percentOf, signupsLastWeek, signupTimeline } from "@/components/event-dashboard/analytics/metrics";
export async function loadAnalyticsPanel({ ctx }: { ctx: EventDashboardContext; }) {
  ctx = await loadEventDashboard(ctx.organisation.slug, ctx.event.id);

  const { event, permissions, now } = ctx;
  if (!permissions.canManageRegistrations) notFound();

  const [counts, feedback, signupDates] = await Promise.all([loadRsvpStatusCounts(event.id), loadFeedbackCount(event.id), loadAllSignupDates(event.id)]);
  const ended = event.endDateTime < now;
  const steps = funnelSteps({ responded: counts.total, going: counts.confirmed, checkedIn: counts.checkedIn, feedback, ended });
  const checkedIn = steps.find((step) => step.key === "checkedIn")!.value;
  const summary = funnelSentence({ responded: counts.total, going: counts.confirmed, checkedIn, ended });

  const parts: MixPart[] = [
    { key: "going", label: "Going", hint: "Have a place and a ticket", value: counts.confirmed, tone: "bg-accent-text" },
    { key: "waitlist", label: "Waitlist", hint: "Signed up after the event was full", value: counts.waitlisted, tone: "bg-info-solid" },
    { key: "pending", label: "Waiting for approval", hint: "Need a decision from an organiser", value: counts.pendingApproval, tone: "bg-highlight" },
    { key: "declined", label: "Declined", hint: "Declined by an organiser", value: counts.rejected, tone: "bg-danger-solid" },
  ];

  const capacity = capacityStatus(counts.confirmed, event.capacity);
  const turnout = checkedIn != null ? percentOf(checkedIn, counts.confirmed) : null;
  const keyNumbers = [
    {
      key: "going",
      label: "Going",
      value: String(counts.confirmed),
      tone: "bg-accent-text",
      bar: capacity ? capacity.percent / 100 : undefined,
      detail: capacity ? (capacity.full ? `Full · all ${event.capacity} places taken` : `${capacity.left} of ${event.capacity} places left`) : "No capacity limit set",
    },
    {
      key: "waitlist",
      label: "Waitlist",
      value: String(counts.waitlisted),
      tone: "bg-info-solid",
      detail: counts.waitlisted ? "Waiting for a place" : "Nobody waiting",
    },
    {
      key: "pending",
      label: "Waiting for approval",
      value: String(counts.pendingApproval),
      tone: "bg-highlight",
      detail: counts.pendingApproval ? "Need your decision" : "Nothing to review",
      action: counts.pendingApproval && !ended ? { tab: "guests", label: "Review" } : undefined,
    },
    {
      key: "turnout",
      label: "Turnout",
      value: turnout != null && checkedIn! <= counts.confirmed ? `${turnout}%` : checkedIn != null ? String(checkedIn) : "—",
      tone: "bg-success-solid",
      bar: turnout != null ? Math.min(100, turnout) / 100 : undefined,
      detail:
        checkedIn == null
          ? "Shows once check-in starts"
          : turnout != null && checkedIn <= counts.confirmed
            ? `${checkedIn} of ${counts.confirmed} going checked in`
            : `${checkedIn} checked in`,
    },
  ];

  const until = ended ? event.endDateTime : now;
  const timeline = signupTimeline(signupDates, until, event.timezone);
  const busiest = busiestDay(
    signupDates.filter((date) => date <= until),
    event.timezone,
  );
  const lastWeek = ended ? null : signupsLastWeek(signupDates, until, event.timezone);


  return { event, permissions, now, counts, feedback, signupDates, ended, steps, checkedIn, summary, parts, capacity, turnout, keyNumbers, timeline, busiest, lastWeek };
}

import { notFound } from "next/navigation";
import { loadEventDashboard } from "@/lib/eventDashboard/context";
