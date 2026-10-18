import { notFound } from "next/navigation";
import { RsvpStatus } from "@prisma/client";
import { BadgesPanel } from "@/components/checkin/badges/BadgesPanel";
import { EventManageHeader } from "@/components/dashboard/EventManageHeader";
import { canUseBadges } from "@/lib/badge/access";
import { badgeBrandingFor, badgeDesignFor, loadBadgeEvent } from "@/lib/badge/data";
import { BULK_BADGE_LIMIT } from "@/lib/badge/sheet";
import { prisma } from "@/lib/db";
import { requireOrgDashboardAccess } from "@/lib/permissions";

type Props = { params: Promise<{ orgSlug: string; eventId: string }> };

export const metadata = { title: "Badges", robots: { index: false, follow: false } };

const LISTED_STATUSES = [RsvpStatus.CONFIRMED, RsvpStatus.WAITLISTED, RsvpStatus.PENDING_APPROVAL];

export default async function EventBadgesPage({ params }: Props) {
  const { orgSlug, eventId } = await params;
  const access = await requireOrgDashboardAccess(orgSlug);
  const event = await loadBadgeEvent(eventId);
  // Same rule as the check-in desk; another organisation's event is simply not found.
  if (!event || event.organisationId !== access.organisation.id || !(await canUseBadges(access.userId, event))) notFound();

  const [details, rsvps, total, form] = await Promise.all([
    prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      select: { status: true, privacyType: true, startDateTime: true, timezone: true, page: { select: { accentColor: true } } },
    }),
    // Names and statuses only: ticket tokens are fetched per badge when printing.
    prisma.rSVP.findMany({
      where: { eventId: event.id, status: { in: LISTED_STATUSES } },
      orderBy: { createdAt: "asc" },
      take: BULK_BADGE_LIMIT,
      select: { id: true, status: true, checkedInAt: true, guestName: true, guestEmail: true, user: { select: { name: true, email: true } } },
    }),
    prisma.rSVP.count({ where: { eventId: event.id, status: { in: LISTED_STATUSES } } }),
    prisma.eventRegistrationForm.findUnique({
      where: { eventId: event.id },
      select: { fields: { select: { key: true, label: true }, orderBy: { sortOrder: "asc" } } },
    }),
  ]);

  const attendees = rsvps.map((rsvp) => ({
    rsvpId: rsvp.id,
    displayName: rsvp.user?.name?.trim() || rsvp.guestName?.trim() || rsvp.user?.email || rsvp.guestEmail || "Guest",
    email: rsvp.user?.email ?? rsvp.guestEmail,
    status: rsvp.status,
    checkedIn: Boolean(rsvp.checkedInAt),
  }));

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
