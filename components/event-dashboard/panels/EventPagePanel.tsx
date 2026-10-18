import { loadEventPagePanel } from "@/lib/views/components__event-dashboard__panels__EventPagePanel";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { EditEventForm } from "@/components/event/EditEventForm";
import { EventWebsiteManager } from "@/components/event/EventWebsiteManager";
import { EventRegistrationFormEditor } from "@/components/registration/EventRegistrationFormEditor";
import { ProgrammeCard } from "../event-page/ProgrammeCard";
import { programmeSummary } from "../event-page/summary";
import { SubTabs } from "../SubTabs";
import { NoPermission } from "./shared";

export async function EventPagePanel({ ctx }: { ctx: EventDashboardContext; }) {
  const { event, permissions, organisation, fields, website, dto, scheduleHref, counts, preview } = await loadEventPagePanel({ ctx });
  const programme = <ProgrammeCard summary={programmeSummary(counts)} scheduleHref={scheduleHref} />;
  return (
    <SubTabs
      label="Event page sections"
      items={[
        {
          value: "details",
          label: "Details",
          content: permissions.canEditDetails ? <EditEventForm organisationSlug={organisation.slug} event={dto} page={website.page} /> : <NoPermission>You do not have permission to edit event details.</NoPermission>,
        },
        {
          value: "page",
          label: "Page & programme",
          content: permissions.canEditDetails ? (
            <EventWebsiteManager organisationSlug={organisation.slug} eventId={event.id} eventSlug={event.slug} {...website} preview={preview} programme={programme} />
          ) : (
            <div className="flex flex-col gap-5">
              {programme}
              <NoPermission>You do not have permission to edit the event page.</NoPermission>
            </div>
          ),
        },
        {
          value: "registration",
          label: "Registration form",
          content: <EventRegistrationFormEditor organisationSlug={organisation.slug} eventId={event.id} fields={fields} />,
        },
      ]}
    />
  );
}
