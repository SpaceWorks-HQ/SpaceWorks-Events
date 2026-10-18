import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { loadCheckInDesk } from "@/lib/eventDashboard/checkIn";
import { doorsStatus, seatDots } from "@/components/event-dashboard/check-in/doors";



export async function loadCheckInPanel({ ctx }: { ctx: EventDashboardContext; }) {
  ctx = await loadEventDashboard(ctx.organisation.slug, ctx.event.id);

  const { event, permissions, organisation, now } = ctx;
  if (!permissions.canCheckIn) notFound();

  const desk = await loadCheckInDesk(ctx);
  const checkInHref = `/dashboard/${organisation.slug}/event/${event.id}/check-in`;
  const doors = doorsStatus({ start: event.startDateTime, end: event.endDateTime, timezone: event.timezone, now, cancelled: event.status === "CANCELLED" });
  const { seats, lit } = seatDots(desk.checkedIn, desk.confirmed);


  return { event, permissions, organisation, now, desk, checkInHref, doors, seats, lit };
}

import { notFound } from "next/navigation";
import { loadEventDashboard } from "@/lib/eventDashboard/context";
