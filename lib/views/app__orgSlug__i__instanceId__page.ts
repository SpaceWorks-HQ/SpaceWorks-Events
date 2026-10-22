import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EventPrivacyType, EventStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isEventPublished, shouldIndexPublicEvent } from "@/lib/eventVisibility";
import { countConfirmedForInstance } from "@/lib/rsvpCapacity";
import { seatTakingWhere } from "@/lib/payments/holds";
import { listPublicTicketTypes } from "@/lib/payments/tickets";
import { DEFAULT_CURRENCY } from "@/lib/payments/money";
import { canAcceptOnlinePayments } from "@/lib/payments/settings";
import { safeTimeZone } from "@/lib/timeZone";
import { resolvePublicEventAccess } from "@/lib/publicEventAccess";
import { formatDateBlock } from "@/lib/format/datetime";
import { ticketingInfo, viewerIsMember } from "@/lib/payments/ticketing";
type Props = { params: Promise<{ orgSlug: string; instanceId: string; }>; };
export async function loadRouteMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug, instanceId } = await params;
  const org = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
  });
  if (!org) return { title: "Event" };
  const instance = await prisma.eventInstance.findFirst({
    where: {
      id: instanceId,
      series: { organisationId: org.id },
    },
    include: { series: true },
  });
  if (!instance) return { title: "Event" };
  const series = instance.series;
  const noindex = { index: false, follow: false } as const;
  if (!isEventPublished(series.status)) {
    return { title: "Event", robots: noindex };
  }
  if (series.privacyType === EventPrivacyType.INVITE_ONLY) {
    return { title: "Event", robots: noindex };
  }
  if (!shouldIndexPublicEvent(series.status, series.privacyType)) {
    return {
      title: series.title,
      description: series.description.slice(0, 160) || `${series.title} · ${org.name}`,
      robots: noindex,
    };
  }
  const description =
    series.description.slice(0, 160) || `${series.title} · ${org.name}`;
  return {
    title: series.title,
    description,
    openGraph: { title: series.title, description, type: "website" },
  };
}
export async function loadInstanceEventView({ params }: Props) {
  const { orgSlug, instanceId } = await params;
  const org = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
  });
  if (!org) notFound();
  const instance = await prisma.eventInstance.findFirst({
    where: {
      id: instanceId,
      series: { organisationId: org.id },
    },
    include: {
      series: true,
    },
  });
  if (!instance) notFound();
  const series = instance.series;
  const access = await resolvePublicEventAccess({ organisationId: org.id, eventSeriesId: series.id, status: series.status, privacyType: series.privacyType });
  if (!access.allowed) notFound();
  const now = new Date();
  const isPast = instance.endDateTime <= now;
  const cancelled = instance.cancelledAt != null;
  const showRsvp = series.status === EventStatus.PUBLISHED && !isPast && !cancelled;
  const [confirmedCount, taken, tickets] = await Promise.all([
    countConfirmedForInstance(instance.id),
    // Seats being paid for are taken too.
    prisma.rSVP.count({ where: { eventInstanceId: instance.id, ...seatTakingWhere(now) } }),
    viewerIsMember(org.id).then((member) => listPublicTicketTypes({ eventSeriesId: series.id, eventInstanceId: instance.id }, series.currency ?? DEFAULT_CURRENCY, now, { member })),
  ]);
  const capacity = instance.capacity ?? series.capacity;
  const spotsLeft = capacity != null ? Math.max(0, capacity - taken) : null;
  const full = spotsLeft !== null && spotsLeft <= 0;
  const timeZone = safeTimeZone(series.timezone);
  const dateBlock = formatDateBlock(instance.startDateTime, timeZone);
  const ticketing = await ticketingInfo({ eventSeriesId: series.id }, tickets, series.currency ?? DEFAULT_CURRENCY, series);
  // Paid tickets and passes are on sale only while the installation allows
  // it and the organisation's account is fully connected.
  const paidSalesOpen = ticketing?.sellsPaid ? await canAcceptOnlinePayments(org.id) : false;
  const paidRequest = series.privacyType === EventPrivacyType.APPROVAL_REQUIRED ? "approval" as const : full ? "waitlist" as const : null;
  return { org, series, access, dateBlock, instance, timeZone, showRsvp, full, confirmedCount, capacity, spotsLeft, isPast, cancelled, tickets, paidSalesOpen, ticketing, paidRequest };
}
