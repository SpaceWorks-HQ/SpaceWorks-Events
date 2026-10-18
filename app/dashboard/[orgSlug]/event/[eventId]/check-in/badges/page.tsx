import { loadEventBadgesView } from "@/lib/views/app__dashboard__orgSlug__event__eventId__check-in__badges__page";

import { BadgesPanel } from "@/components/checkin/badges/BadgesPanel";
import { EventManageHeader } from "@/components/dashboard/EventManageHeader";
import { badgeBrandingFor, badgeDesignFor } from "@/lib/badge/presentation";
import { BULK_BADGE_LIMIT } from "@/lib/badge/sheet";

type Props = { params: Promise<{ orgSlug: string; eventId: string; }>; };

export const metadata = { title: "Badges", robots: { index: false, follow: false } };



export default async function EventBadgesPage({ params }: Props) {
  const { access, event, details, form, attendees, total } = await loadEventBadgesView({ params });
  return (
    <div className="flex flex-col gap-6">
      <EventManageHeader
        back={{ href: `/dashboard/${access.organisation.slug}/event/${event.id}/check-in`, label: "Back to check-in" }}
        event={{ title: event.title, status: details.status, privacyType: details.privacyType, startDateTime: details.startDateTime, timezone: details.timezone, accentColor: details.page?.accentColor }}
      />
      <BadgesPanel
        organisationSlug={access.organisation.slug}
        organisationName={event.organisation.name}
        eventId={event.id}
        eventTitle={event.title}
        design={badgeDesignFor(event)}
        branding={badgeBrandingFor(event)}
        registrationFields={form?.fields ?? []}
        attendees={attendees}
        totalAttendees={total}
        bulkLimit={BULK_BADGE_LIMIT}
      />
    </div>
  );
}
