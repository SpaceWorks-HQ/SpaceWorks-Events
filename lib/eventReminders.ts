import "server-only";

import { EventStatus, RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EVENT_REMINDER_KIND } from "@/lib/outbox";
import { personEmail } from "@/lib/notices";

/** Reminders go out about this long before the start. */
export const REMINDER_LEAD_MS = 24 * 60 * 60_000;
/** Someone who registered this recently has just had their confirmation. */
const RECENT_SIGNUP_MS = 12 * 60 * 60_000;
const BATCH = 500;

/**
 * The beat's reminder job: each confirmed guest of a published event, or of
 * a live series date, starting within the next day gets one reminder. Each
 * registration is claimed before its message is queued, in one transaction,
 * so two beats never send it twice.
 */
export async function sendEventReminders(now = new Date()) {
  const until = new Date(now.getTime() + REMINDER_LEAD_MS);
  const [events, dates] = await Promise.all([
    prisma.event.findMany({ where: { status: EventStatus.PUBLISHED, startDateTime: { gt: now, lte: until } }, select: { id: true } }),
    prisma.eventInstance.findMany({ where: { startDateTime: { gt: now, lte: until }, cancelledAt: null, series: { status: EventStatus.PUBLISHED } }, select: { id: true } }),
  ]);
  if (events.length === 0 && dates.length === 0) return { queued: 0 };
  const due = await prisma.rSVP.findMany({
    where: {
      status: RsvpStatus.CONFIRMED,
      reminderSentAt: null,
      createdAt: { lte: new Date(now.getTime() - RECENT_SIGNUP_MS) },
      OR: [{ eventId: { in: events.map((event) => event.id) } }, { eventInstanceId: { in: dates.map((date) => date.id) } }],
    },
    select: { id: true, guestEmail: true, user: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });
  let queued = 0;
  for (const rsvp of due) {
    const to = personEmail(rsvp);
    queued += await prisma.$transaction(async (tx) => {
      const claim = await tx.rSVP.updateMany({ where: { id: rsvp.id, reminderSentAt: null, status: RsvpStatus.CONFIRMED }, data: { reminderSentAt: now } });
      if (claim.count !== 1 || !to) return 0;
      await tx.outboxMessage.create({ data: { kind: EVENT_REMINDER_KIND, payload: { to, rsvpId: rsvp.id } } });
      return 1;
    });
  }
  return { queued };
}
