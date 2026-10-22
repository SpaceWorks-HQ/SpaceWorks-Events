import { loadAnalyticsPanel } from "@/lib/views/components__event-dashboard__panels__AnalyticsPanel";
import { EventReportDownloadButton } from "@/components/reports/EventReportDownloadButton";
import { EmptyState } from "@/components/ui/display";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { ArrivalsCard, CheckInMethodsCard, FunnelCard, KeyNumbers, MoneyCard, QuestionsCard, ShortLinkCard, StatusMixCard, TimelineCard, WaitlistCard } from "../analytics/AnalyticsSections";
import { hasRevenue } from "@/lib/payments/revenueMetrics";
import { NoPermission } from "./shared";

/** Analytics tab: registration numbers are organisation-admin only, like the RSVP actions and the PDF report. */
export async function AnalyticsPanel({ ctx }: { ctx: EventDashboardContext; }) {
  const { permissions } = ctx;
  if (!permissions.canViewAnalytics) return <NoPermission>You do not have permission to see registration numbers for this event.</NoPermission>;
  const { event, counts, ended, steps, summary, parts, keyNumbers, timeline, busiest, lastWeek, arrivals, sources, questions, waitlist, clicks, revenue } = await loadAnalyticsPanel({ ctx });
  const charted = questions.filter((question) => question.answered > 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-ui text-ink-secondary">{ended ? "Final numbers for this event. Everything here is also in the PDF report." : "Live numbers for this event. The PDF report is ready once the event ends."}</p>
        {permissions.canDownloadReports && ended ? <EventReportDownloadButton href={`/api/reports/event/${event.id}`} label="Download report (PDF)" /> : null}
      </div>

      {counts.total === 0 ? (
        <EmptyState title="No responses yet">Numbers show up here as soon as people sign up.</EmptyState>
      ) : (
        <>
          <KeyNumbers items={keyNumbers} />
          {revenue && hasRevenue(revenue) ? <MoneyCard revenue={revenue} exportHref={`/api/exports/events/${event.id}/orders`} /> : null}
          <FunnelCard steps={steps} summary={summary} />
          <div className="grid gap-5 lg:grid-cols-2">
            <StatusMixCard parts={parts} />
            {timeline ? <TimelineCard timeline={timeline} busiest={busiest} lastWeek={lastWeek} /> : null}
          </div>
          {arrivals || sources ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {arrivals ? <ArrivalsCard arrivals={arrivals} checkedIn={counts.checkedIn} timeZone={event.timezone} /> : null}
              {sources ? <CheckInMethodsCard sources={sources} /> : null}
            </div>
          ) : null}
          {waitlist || clicks ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {waitlist ? <WaitlistCard waitlist={waitlist} /> : null}
              {clicks ? <ShortLinkCard code={clicks.code} series={clicks.series} /> : null}
            </div>
          ) : null}
          {charted.length ? <QuestionsCard questions={charted} going={counts.confirmed} /> : null}
        </>
      )}
    </div>
  );
}
