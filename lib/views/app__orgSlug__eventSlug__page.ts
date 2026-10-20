import { eventForView } from "@/lib/frontend/eventView";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContentVisibility, EventPrivacyType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isEventPublished, shouldIndexPublicEvent } from "@/lib/eventVisibility";
import { resolvePublicEventAccess } from "@/lib/publicEventAccess";
import { countConfirmedForEvent, countHeldForEvent } from "@/lib/rsvpCapacity";
import { listPublicTicketTypes } from "@/lib/payments/tickets";
import { DEFAULT_CURRENCY } from "@/lib/payments/money";
import { canAcceptOnlinePayments } from "@/lib/payments/settings";
import { describeRefundPolicy } from "@/lib/payments/refundPolicy";
type Props = { params: Promise<{ orgSlug: string; eventSlug: string; }>; };
export async function loadRouteMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug, eventSlug } = await params;
  const org = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
  });
  const event = org
    ? await prisma.event.findUnique({
      where: {
        organisationId_slug: { organisationId: org.id, slug: eventSlug },
      },
    })
    : null;
  const page = event
    ? await prisma.eventPage.findUnique({
      where: { eventId: event.id },
      select: { isPublished: true },
    })
    : null;
  if (
    !event ||
    !page?.isPublished ||
    !isEventPublished(event.status) ||
    event.privacyType === EventPrivacyType.INVITE_ONLY
  )
    return { title: "Event", robots: { index: false, follow: false } };
  const description = event.description.slice(0, 160) || event.title;
  return {
    title: event.title,
    description,
    alternates: { canonical: `/${org!.slug}/${event.slug}` },
    robots: shouldIndexPublicEvent(event.status, event.privacyType, event.listedPublicly)
      ? undefined
      : { index: false, follow: false },
    openGraph: {
      title: event.title,
      description,
      type: "website",
      // Without a cover, leave `images` out so the generated share card (opengraph-image.tsx) is used.
      ...(event.coverImageUrl ? { images: [{ url: event.coverImageUrl }] } : {}),
    },
  };
}
export async function loadEventView({ params }: Props) {
  const { orgSlug, eventSlug } = await params;
  const org = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
  });
  if (!org) notFound();
  const event = await prisma.event.findUnique({
    where: { organisationId_slug: { organisationId: org.id, slug: eventSlug } },
  });
  if (!event) notFound();
  const release = await prisma.eventPage.findUnique({
    where: { eventId: event.id },
    select: { isPublished: true },
  });
  const access = await resolvePublicEventAccess({
    organisationId: org.id,
    eventId: event.id,
    status: event.status,
    privacyType: event.privacyType,
    websiteReleased: release?.isPublished ?? false,
  });
  if (!access.allowed) notFound();
  const preview = access.preview;
  const published = { visibility: ContentVisibility.PUBLISHED };
  const [
    page,
    highlights,
    sessions,
    speakers,
    sponsors,
    faqs,
    resources,
    form,
    confirmed,
    viewerRsvp,
    held,
    tickets,
  ] = await Promise.all([
    prisma.eventPage.findUnique({
      where: { eventId: event.id },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.eventHighlight.findMany({
      where: { eventId: event.id, ...published },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.eventSession.findMany({
      where: { eventId: event.id, ...published },
      include: {
        track: true,
        speakers: {
          where: { speaker: { visibility: ContentVisibility.PUBLISHED } },
          include: { speaker: true },
        },
      },
      orderBy: [{ startDateTime: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.eventSpeaker.findMany({
      where: { eventId: event.id, ...published },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.eventSponsor.findMany({
      where: { eventId: event.id, ...published },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.eventFaq.findMany({
      where: { eventId: event.id, ...published },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.eventResource.findMany({
      where: { eventId: event.id, ...published, externalUrl: { not: null } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.eventRegistrationForm.findUnique({
      where: { eventId: event.id },
      include: { fields: { orderBy: { sortOrder: "asc" } } },
    }),
    countConfirmedForEvent(event.id),
    auth().then((session) =>
      session?.user?.id
        ? prisma.rSVP.findFirst({
          where: { eventId: event.id, userId: session.user.id },
          select: { checkInToken: true, status: true },
        })
        : null,
    ),
    countHeldForEvent(event.id),
    listPublicTicketTypes(event.id, event.currency ?? DEFAULT_CURRENCY),
  ]);
  // Paid tickets are on sale only while the installation allows it and the
  // organisation's account is fully connected.
  const sellsPaid = tickets.some((ticket) => ticket.priceMinor > 0);
  const paidSalesOpen = sellsPaid ? await canAcceptOnlinePayments(org.id) : false;
  // What the form needs to sell paid tickets: whether codes exist, and the refund terms.
  const ticketing = sellsPaid
    ? {
      promoCodes: (await prisma.promoCode.count({ where: { eventId: event.id, archivedAt: null } })) > 0,
      refundPolicy: describeRefundPolicy({ kind: event.refundPolicyKind, hours: event.refundPolicyHours, percent: event.refundPolicyPercent, text: event.refundPolicyText }),
      refundPolicyText: event.refundPolicyText,
    }
    : null;
  return { org, preview, event: eventForView(event), page, highlights, sessions, speakers, sponsors, faqs, resources, form, confirmed, viewerRsvp, held, tickets, paidSalesOpen, ticketing };
}
