import { loadAnalyticsPanel } from "@/lib/views/components__event-dashboard__panels__AnalyticsPanel";
import { EventReportDownloadButton } from "@/components/reports/EventReportDownloadButton";
import { EmptyState } from "@/components/ui/display";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { FunnelCard, KeyNumbers, StatusMixCard, TimelineCard } from "../analytics/AnalyticsSections";
import { NoPermission } from "./shared";

/** Analytics tab: registration numbers are organisation-admin only, like the RSVP actions and the PDF report. */
export async function AnalyticsPanel({ ctx }: { ctx: EventDashboardContext; }) {
  const { permissions } = ctx;
  if (!permissions.canManageRegistrations) return <NoPermission>You do not have permission to see registration numbers for this event.</NoPermission>;
  const { event, counts, ended, steps, summary, parts, keyNumbers, timeline, busiest, lastWeek } = await loadAnalyticsPanel({ ctx });
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-ui text-ink-secondary">{ended ? "Final numbers for this event. Everything here is also in the PDF report." : "Live numbers for this event. The PDF report is ready once the event ends."}</p>
        {permissions.isAdmin && ended ? <EventReportDownloadButton href={`/api/reports/event/${event.id}`} label="Download report (PDF)" /> : null}
      </div>

      {counts.total === 0 ? (
        <EmptyState title="No responses yet">Numbers show up here as soon as people sign up.</EmptyState>
      ) : (
        <>
          <KeyNumbers items={keyNumbers} />
          <FunnelCard steps={steps} summary={summary} />
          <div className="grid gap-5 lg:grid-cols-2">
            <StatusMixCard parts={parts} />
            {timeline ? <TimelineCard timeline={timeline} busiest={busiest} lastWeek={lastWeek} /> : null}
          </div>
        </>
      )}
    </div>
  );
}
