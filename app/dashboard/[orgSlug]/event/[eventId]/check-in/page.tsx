import { loadEventCheckInView } from "@/lib/views/app__dashboard__orgSlug__event__eventId__check-in__page";
import Link from "next/link";
import { EventCheckInClient } from "@/components/checkin/EventCheckInClient";
import { CheckInStationSettings } from "@/components/checkin/CheckInStationSettings";
import { buttonClasses } from "@/components/ui/button";
import { EventManageHeader } from "@/components/dashboard/EventManageHeader";
import { badgeBrandingFor, badgeDesignFor } from "@/lib/badge/presentation";

type Props = {
  params: Promise<{ orgSlug: string; eventId: string; }>;
};

export const metadata = { title: "Event check-in", robots: { index: false, follow: false } };

export default async function EventCheckInPage({ params }: Props) {
  const { confirmed, stationEnabled, organisation, event, badgesHref, registrationForm, checkedInCount, recent, badgeEvent, isAdmin, stationUrl } = await loadEventCheckInView({ params });
  return (
    <div className="flex flex-col gap-6">
      <EventManageHeader
        back={{ href: `/dashboard/${organisation.slug}/event/${event.id}`, label: "Back to event" }}
        event={{ title: event.title, status: event.status, privacyType: event.privacyType, startDateTime: event.startDateTime, timezone: event.timezone, accentColor: event.page?.accentColor }}
        actions={<Link href={badgesHref} className={buttonClasses({ variant: "secondary" })}>Badges</Link>}
      />
      <EventCheckInClient
        organisationSlug={organisation.slug}
        organisationName={organisation.name}
        eventId={event.id}
        eventTitle={event.title}
        registrationFields={registrationForm?.fields ?? []}
        stats={{ confirmed, checkedIn: checkedInCount }}
        recent={recent}
        badge={{ design: badgeDesignFor(badgeEvent), branding: badgeBrandingFor(badgeEvent), canSave: true }}
      />
      {isAdmin ? <CheckInStationSettings organisationSlug={organisation.slug} eventId={event.id} stationUrl={stationUrl} enabled={stationEnabled} /> : null}
    </div>
  );
}
