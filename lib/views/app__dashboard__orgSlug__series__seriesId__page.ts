import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EventPermission } from "@prisma/client";
import { getRequestOrigin } from "@/lib/publicUrl";
import { isOrgAdmin, requireOrgDashboardAccess } from "@/lib/permissions";
import { canViewEventDashboard } from "@/lib/eventAccess";
import { percentOf } from "@/components/event-dashboard/analytics/metrics";
import { seatTakingWhere } from "@/lib/payments/holds";
import { loadTicketSettings } from "@/lib/payments/ticketSettings";
import { attendeeOrder, attendeeOrderSelect } from "@/lib/eventDashboard/data";
type Props = { params: Promise<{ orgSlug: string; seriesId: string; }>; };
const MAX_BROWSER_ATTENDEES = 250;
export async function loadSeriesManageView({ params }: Props) {
  const { orgSlug, seriesId } = await params;
  const access = await requireOrgDashboardAccess(orgSlug);
  const { organisation } = access;
  const series = await prisma.eventSeries.findFirst({
    where: { id: seriesId, organisationId: organisation.id },
    include: {
      instances: {
        orderBy: { startDateTime: "asc" },
        take: 20,
      },
      scheduleItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!series) notFound();
  if (!access.membership && !(await canViewEventDashboard({ userId: access.userId, organisationId: organisation.id, eventSeriesId: series.id }))) notFound();
  const isAdmin = Boolean(access.membership && isOrgAdmin(access.membership.role));
  const currentGrant = isAdmin ? null : await prisma.eventCollaborator.findFirst({
    where: { eventSeriesId: series.id, userId: access.userId },
    select: { permissions: true },
  });
  const granted = (permission: EventPermission) => isAdmin || Boolean(currentGrant?.permissions.includes(permission));
  const canManageRegistrations = isAdmin;
  const canManageInvites = granted(EventPermission.MANAGE_INVITATIONS);
  const canManageSchedule = granted(EventPermission.PUBLISH_AND_SCHEDULE);
  // Ticket types, passes, promo codes and the refund policy: as on an event.
  const canEditTickets = granted(EventPermission.EDIT_DETAILS);
  const invites = canManageInvites
    ? await prisma.seriesInvite.findMany({
      where: { eventSeriesId: series.id },
      orderBy: { createdAt: "desc" },
    })
    : [];
  const now = new Date();
  const upcoming = await prisma.eventInstance.findMany({
    where: { eventSeriesId: series.id, endDateTime: { gt: now } },
    orderBy: { startDateTime: "asc" },
    take: 30,
    select: { id: true, startDateTime: true, capacity: true, cancelledAt: true },
  });
  const takenRows = upcoming.length
    ? await prisma.rSVP.groupBy({ by: ["eventInstanceId"], where: { eventInstanceId: { in: upcoming.map((date) => date.id) }, ...seatTakingWhere(now) }, _count: { _all: true } })
    : [];
  const takenBy = new Map(takenRows.map((row) => [row.eventInstanceId as string, row._count._all]));
  const dates = upcoming.map((date) => ({ id: date.id, start: date.startDateTime.toISOString(), capacity: date.capacity, taken: takenBy.get(date.id) ?? 0, cancelled: date.cancelledAt != null }));
  const tickets = canEditTickets
    ? await loadTicketSettings({ owner: { eventSeriesId: series.id }, organisation, currency: series.currency, refundPolicy: series, transfers: series, now })
    : null;
  // The guest list shows the next date that is still on.
  const firstInstanceId = upcoming.find((date) => !date.cancelledAt)?.id;
  const rsvps = firstInstanceId && canManageRegistrations
    ? await prisma.rSVP.findMany({
      where: { eventInstanceId: firstInstanceId },
      include: { user: { select: { id: true, name: true, email: true } }, ticketType: { select: { name: true } }, order: { select: attendeeOrderSelect } },
      orderBy: { createdAt: "desc" },
      take: MAX_BROWSER_ATTENDEES + 1,
    })
    : [];
  const origin = await getRequestOrigin();
  const canDownloadReports = Boolean(access.membership && isOrgAdmin(access.membership.role));
  const finishedInstances = series.instances.filter((instance) => instance.endDateTime < now);
  const attendeesTruncated = rsvps.length > MAX_BROWSER_ATTENDEES;
  const attendees = rsvps.slice(0, MAX_BROWSER_ATTENDEES).map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    guestEmail: r.guestEmail,
    guestName: r.guestName,
    user: r.user
      ? { id: r.user.id, name: r.user.name, email: r.user.email }
      : null,
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
    ticketUrl: `${origin}/ticket/${r.checkInToken}`,
    ticketName: r.ticketType?.name ?? null,
    order: r.order && r.order.totalMinor > BigInt(0) ? attendeeOrder(r.order) : null,
    rawAnswers: [],
  }));
  // Attendance across finished occurrences (organisers only): counts, never people.
  let rollup: { rows: Array<{ id: string; start: Date; going: number; came: number; turnout: number | null }>; averageTurnout: number | null; totalCame: number } | null = null;
  if (canDownloadReports && finishedInstances.length) {
    const ids = finishedInstances.map((instance) => instance.id);
    const [going, came] = await Promise.all([
      prisma.rSVP.groupBy({ by: ["eventInstanceId"], where: { eventInstanceId: { in: ids }, status: "CONFIRMED" }, _count: { _all: true } }),
      prisma.rSVP.groupBy({ by: ["eventInstanceId"], where: { eventInstanceId: { in: ids }, status: "CONFIRMED", checkedInAt: { not: null } }, _count: { _all: true } }),
    ]);
    const goingBy = new Map(going.map((row) => [row.eventInstanceId as string, row._count._all]));
    const cameBy = new Map(came.map((row) => [row.eventInstanceId as string, row._count._all]));
    const rows = finishedInstances.map((instance) => {
      const g = goingBy.get(instance.id) ?? 0;
      const c = cameBy.get(instance.id) ?? 0;
      return { id: instance.id, start: instance.startDateTime, going: g, came: c, turnout: percentOf(c, g) };
    });
    const totalGoing = rows.reduce((sum, row) => sum + row.going, 0);
    const totalCame = rows.reduce((sum, row) => sum + row.came, 0);
    rollup = { rows, averageTurnout: percentOf(totalCame, totalGoing), totalCame };
  }
  return { series, isAdmin, organisation, canManageInvites, invites, canManageSchedule, canDownloadReports, finishedInstances, firstInstanceId, canManageRegistrations, now, attendees, attendeesTruncated, rollup, dates, tickets };
}
