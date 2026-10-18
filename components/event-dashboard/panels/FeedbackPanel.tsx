import { loadFeedbackPanel } from "@/lib/views/components__event-dashboard__panels__FeedbackPanel";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { formatDate } from "@/lib/format/datetime";
import { FeedbackFormEditor } from "@/components/feedback/FeedbackFormEditor";
import { ResponsesCard } from "@/components/event-dashboard/feedback/ResponsesCard";
import { NoPermission } from "./shared";

const MAX_BROWSER_FEEDBACK_RESPONSES = 250;

export async function FeedbackPanel({ ctx }: { ctx: EventDashboardContext; }) {
  const { permissions } = ctx;
  if (!permissions.isAdmin) return <NoPermission>Only organisation owners and admins can manage feedback for this event.</NoPermission>;
  const { event, organisation, form, fields, canViewResponses, responseRecords, insights, responses } = await loadFeedbackPanel({ ctx });
  return (
    <FeedbackFormEditor
      organisationSlug={organisation.slug}
      eventId={event.id}
      feedbackUrl={`${ctx.origin}/${organisation.slug}/${event.slug}/feedback`}
      form={form}
      fields={fields}
      eventTitle={event.title}
      eventDateLabel={formatDate(event.startDateTime, event.timezone)}
      organisationName={organisation.name}
      responses={canViewResponses ? (
        <ResponsesCard
          insights={insights}
          responses={responses}
          truncated={responseRecords.length > MAX_BROWSER_FEEDBACK_RESPONSES}
          exportHref={form ? `/api/exports/events/${event.id}/feedback` : undefined}
          timeZone={event.timezone}
        />
      ) : (
        <NoPermission>You do not have permission to view feedback responses.</NoPermission>
      )}
    />
  );
}
