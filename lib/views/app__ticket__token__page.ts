import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { safeTimeZone } from "@/lib/timeZone";
import { safeHttpUrl } from "@/lib/safeHttpUrl";
import { type CalendarEvent } from "@/lib/calendarInvite";
import { INK_ACCENT } from "@/lib/theme/accent";
import { type ChipTone } from "@/components/ui/display";
type Props = {
  params: Promise<{ token: string; }>;
};
function validToken(value: string | undefined) {
  const token = value?.trim() ?? "";
  return /^[A-Za-z0-9_-]{8,128}$/.test(token) ? token : null;
}
export async function loadRouteMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const safeToken = validToken(token);
  if (!safeToken) return { title: "Your Ticket", robots: { index: false, follow: false }, referrer: "no-referrer" };
  const rsvp = await prisma.rSVP.findUnique({
    where: { checkInToken: safeToken },
    select: {
      event: { select: { title: true } },
      eventInstance: { select: { series: { select: { title: true } } } },
    },
  });
  const title = rsvp?.event?.title ?? rsvp?.eventInstance?.series?.title;
  return {
    title: title ? `Ticket · ${title}` : "Your Ticket",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}
function displayName(r: {
  user: { name: string | null; } | null;
  guestName?: string | null;
  guestEmail: string | null;
}) {
  const n = r.user?.name?.trim();
  if (n) return n;
  const gn = r.guestName?.trim();
  if (gn) return gn;
  if (r.guestEmail) return r.guestEmail.split("@")[0] ?? "Guest";
  return "Guest";
}
function statusLabel(status: string) {
  switch (status) {
    case "CONFIRMED":
      return { label: "Confirmed", tone: "success" as ChipTone };
    case "WAITLISTED":
      return { label: "Waitlisted", tone: "warning" as ChipTone };
    case "PENDING_APPROVAL":
      return { label: "Pending approval", tone: "warning" as ChipTone };
    case "REJECTED":
      return { label: "Rejected", tone: "danger" as ChipTone };
    default:
      return { label: status, tone: "neutral" as ChipTone };
  }
}
export async function loadTicketView({ params }: Props) {

  const { token } = await params;
  const safeToken = validToken(token);
  if (!safeToken) notFound();

  const rsvp = await prisma.rSVP.findUnique({
    where: { checkInToken: safeToken },
    include: {
      user: { select: { name: true } },
      event: {
        select: {
          title: true,
          startDateTime: true,
          endDateTime: true,
          timezone: true,
          location: true,
          mapLinkUrl: true,
          isOnline: true,
          slug: true,
          page: { select: { accentColor: true } },
          organisation: { select: { slug: true, name: true } },
        },
      },
      eventInstance: {
        select: {
          startDateTime: true,
          endDateTime: true,
          series: {
            select: {
              title: true,
              timezone: true,
              organisation: { select: { slug: true, name: true } },
            },
          },
        },
      },
    },
  });

  if (!rsvp) notFound();

  let orgName: string;
  let orgSlug: string;
  let eventSlug: string | null = null;
  let title: string;
  let start: Date;
  let timeZone: string;
  let location: string | null = null;
  let mapHref: string | null = null;
  let accent: string | null | undefined;
  let calendarEvent: CalendarEvent;

  if (rsvp.eventId && rsvp.event) {
    const ev = rsvp.event;
    orgName = ev.organisation.name;
    orgSlug = ev.organisation.slug;
    eventSlug = ev.slug;
    title = ev.title;
    start = ev.startDateTime;
    timeZone = safeTimeZone(ev.timezone);
    location = ev.location || null;
    mapHref = ev.isOnline ? null : safeHttpUrl(ev.mapLinkUrl);
    accent = ev.page?.accentColor;
    calendarEvent = {
      title: ev.title,
      startDateTime: ev.startDateTime,
      endDateTime: ev.endDateTime,
      timezone: ev.timezone,
      location: ev.location,
    };
  } else if (rsvp.eventInstanceId && rsvp.eventInstance) {
    const inst = rsvp.eventInstance;
    orgName = inst.series.organisation.name;
    orgSlug = inst.series.organisation.slug;
    title = inst.series.title;
    start = inst.startDateTime;
    timeZone = safeTimeZone(inst.series.timezone);
    accent = INK_ACCENT;
    calendarEvent = {
      title: inst.series.title,
      startDateTime: inst.startDateTime,
      endDateTime: inst.endDateTime,
      timezone: inst.series.timezone,
    };
  } else {
    notFound();
  }

  const status = statusLabel(rsvp.status);
  const isCheckedIn = Boolean(rsvp.checkedInAt);

  const confirmed = rsvp.status === "CONFIRMED";
  const name = displayName(rsvp);
  const eventPageHref = eventSlug ? `/${orgSlug}/${eventSlug}` : `/${orgSlug}`;


  return { rsvp: { checkInToken: rsvp.checkInToken, checkedInAt: rsvp.checkedInAt, status: rsvp.status }, orgName, orgSlug, eventSlug, title, start, timeZone, location, mapHref, accent, calendarEvent, status, isCheckedIn, confirmed, name, eventPageHref, safeToken };
}
