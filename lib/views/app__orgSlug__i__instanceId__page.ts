import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EventPrivacyType, EventStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isEventPublished, shouldIndexPublicEvent } from "@/lib/eventVisibility";
import { countConfirmedForInstance } from "@/lib/rsvpCapacity";
import { safeTimeZone } from "@/lib/timeZone";
import { resolvePublicEventAccess } from "@/lib/publicEventAccess";
import { formatDateBlock } from "@/lib/format/datetime";
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
  const isPast = instance.endDateTime <= new Date();
  const showRsvp = series.status === EventStatus.PUBLISHED && !isPast;
  const confirmedCount = await countConfirmedForInstance(instance.id);
  const spotsLeft =
    series.capacity != null
      ? Math.max(0, series.capacity - confirmedCount)
      : null;
  const full = spotsLeft !== null && spotsLeft <= 0;
  const timeZone = safeTimeZone(series.timezone);
  const dateBlock = formatDateBlock(instance.startDateTime, timeZone);
  return { org, series, access, dateBlock, instance, timeZone, showRsvp, full, confirmedCount, spotsLeft, isPast };
}
