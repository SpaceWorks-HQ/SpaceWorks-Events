import "server-only";

import { RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { encodeCursor, type ApiCursor } from "@/lib/api/v1/pagination";
import {
  eventDtoSchema,
  eventResponseSchema,
  eventsResponseSchema,
  ordersResponseSchema,
  participantsResponseSchema,
} from "@/lib/api/v1/schemas";
import { minorToDecimalString } from "@/lib/payments/money";
import type { ParticipantAttendance } from "@/lib/api/v1/schemas";

const eventSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  tags: true,
  coverImageUrl: true,
  startDateTime: true,
  endDateTime: true,
  timezone: true,
  location: true,
  mapLinkUrl: true,
  isOnline: true,
  capacity: true,
  status: true,
  privacyType: true,
  createdAt: true,
} as const;

function eventDto(event: Awaited<ReturnType<typeof findEventRecord>>) {
  if (!event) return null;
  return eventDtoSchema.parse({
    ...event,
    startDateTime: event.startDateTime.toISOString(),
    endDateTime: event.endDateTime.toISOString(),
    createdAt: event.createdAt.toISOString(),
  });
}

async function findEventRecord(organisationId: string, eventId: string) {
  return prisma.event.findFirst({
    where: { id: eventId, organisationId },
    select: eventSelect,
  });
}

export async function getApiEvent(organisationId: string, eventId: string) {
  const event = await findEventRecord(organisationId, eventId);
  return event ? eventResponseSchema.parse({ data: eventDto(event) }) : null;
}

export async function listApiEvents(
  organisationId: string,
  limit: number,
  cursor: ApiCursor | null,
) {
  const rows = await prisma.event.findMany({
    where: {
      organisationId,
      ...(cursor ? {
        OR: [
          { createdAt: { lt: new Date(cursor.timestamp) } },
          { createdAt: new Date(cursor.timestamp), id: { lt: cursor.id } },
        ],
      } : {}),
    },
    select: eventSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return eventsResponseSchema.parse({
    data: page.map((event) => eventDto(event)),
    pagination: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null },
  });
}

export async function listApiParticipants(
  organisationId: string,
  eventId: string,
  limit: number,
  cursor: ApiCursor | null,
  attendance: ParticipantAttendance = "all",
  includeAttendance = false,
) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, organisationId },
    select: { id: true },
  });
  if (!event) return null;

  const rows = await prisma.rSVP.findMany({
    where: {
      eventId: event.id,
      status: RsvpStatus.CONFIRMED,
      ...(attendance === "checked_in" ? { checkedInAt: { not: null } } : {}),
      ...(attendance === "not_checked_in" ? { checkedInAt: null } : {}),
      ...(cursor ? {
        OR: [
          { createdAt: { lt: new Date(cursor.timestamp) } },
          { createdAt: new Date(cursor.timestamp), id: { lt: cursor.id } },
        ],
      } : {}),
    },
    select: {
      id: true,
      guestName: true,
      createdAt: true,
      checkedInAt: true,
      user: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return participantsResponseSchema.parse({
    data: page.map((row) => ({
      id: row.id,
      displayName: row.user?.name?.trim() || row.guestName?.trim() || "Participant",
      registeredAt: row.createdAt.toISOString(),
      ...(includeAttendance ? { checkedInAt: row.checkedInAt?.toISOString() ?? null } : {}),
    })),
    pagination: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null },
  });
}

/** An event's orders, newest first, as totals only: no buyer contact data, no links or provider IDs. */
export async function listApiOrders(organisationId: string, eventId: string, limit: number, cursor: ApiCursor | null) {
  const event = await prisma.event.findFirst({ where: { id: eventId, organisationId }, select: { id: true } });
  if (!event) return null;
  const rows = await prisma.order.findMany({
    where: {
      eventId: event.id,
      ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.timestamp) } }, { createdAt: new Date(cursor.timestamp), id: { lt: cursor.id } }] } : {}),
    },
    select: {
      id: true, reference: true, status: true, currency: true, totalMinor: true, testMode: true, createdAt: true,
      _count: { select: { rsvps: true } },
      payments: { where: { status: { in: ["PAID_ONLINE", "PAID_OFFLINE"] } }, select: { amountMinor: true, refunds: { where: { status: "SUCCEEDED" }, select: { amountMinor: true } } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const zero = BigInt(0);
  return ordersResponseSchema.parse({
    data: page.map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      currency: row.currency,
      total: minorToDecimalString(row.totalMinor, row.currency),
      paid: minorToDecimalString(row.payments.reduce((sum, payment) => sum + payment.amountMinor, zero), row.currency),
      refunded: minorToDecimalString(row.payments.flatMap((payment) => payment.refunds).reduce((sum, refund) => sum + refund.amountMinor, zero), row.currency),
      tickets: row._count.rsvps,
      testMode: row.testMode,
      placedAt: row.createdAt.toISOString(),
    })),
    pagination: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null },
  });
}
