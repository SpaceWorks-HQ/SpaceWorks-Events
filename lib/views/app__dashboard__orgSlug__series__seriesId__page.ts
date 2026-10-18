import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EventPermission } from "@prisma/client";
import { getRequestOrigin } from "@/lib/publicUrl";
import { isOrgAdmin, requireOrgDashboardAccess } from "@/lib/permissions";
import { canViewEventDashboard } from "@/lib/eventAccess";
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
  const invites = canManageInvites
    ? await prisma.seriesInvite.findMany({
      where: { eventSeriesId: series.id },
      orderBy: { createdAt: "desc" },
    })
    : [];
  const firstInstanceId = series.instances[0]?.id;
  const rsvps = firstInstanceId && canManageRegistrations
    ? await prisma.rSVP.findMany({
      where: { eventInstanceId: firstInstanceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: MAX_BROWSER_ATTENDEES + 1,
    })
    : [];
  const origin = await getRequestOrigin();
  const now = new Date();
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
    rawAnswers: [],
  }));
  return { series, isAdmin, organisation, canManageInvites, invites, canManageSchedule, canDownloadReports, finishedInstances, firstInstanceId, canManageRegistrations, now, attendees, attendeesTruncated };
}
