import { requireSuperAdminMfa } from "@/lib/permissions";
import { ApiClientStatus, MembershipRole, OutboxStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DAY_MS, fillDailySeries, minutesAgo, windowStart } from "@/lib/superAdminInsights";
import { loadDailyActivity } from "@/lib/superAdminData";

export async function loadSuperAdminOverviewView() {
  await requireSuperAdminMfa();
  const [
    orgs,
    users,
    events,
    series,
    instances,
    rsvps,
    memberships,
    orgInvites,
    checkIns,
    feedbackResponses,
    broadcasts,
    apiClients,
    failedEmails,
    stuckEmails,
    managersWithoutMfa,
    unverifiedUsers,
  ] = await Promise.all([
    prisma.organisation.count(),
    prisma.user.count(),
    prisma.event.count(),
    prisma.eventSeries.count(),
    prisma.eventInstance.count(),
    prisma.rSVP.count(),
    prisma.membership.count(),
    prisma.organisationInvite.count(),
    prisma.rSVP.count({ where: { checkedInAt: { not: null } } }),
    prisma.eventFeedbackResponse.count(),
    prisma.eventBroadcast.count(),
    prisma.apiClient.count({ where: { status: ApiClientStatus.ACTIVE } }),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.FAILED } }),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.PENDING, availableAt: { lt: minutesAgo(15) } } }),
    prisma.user.count({ where: { mfaEnabledAt: null, memberships: { some: { role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] } } } } }),
    prisma.user.count({ where: { emailVerified: null } }),
  ]);
  // Windows are computed in JS and bound through Prisma, which compares
  // DateTime columns in UTC regardless of the database session TimeZone.
  const now = new Date();
  const since24h = new Date(now.getTime() - DAY_MS);
  const since7d = new Date(now.getTime() - 7 * DAY_MS);
  const [orgs24h, events24h, rsvps24h, rsvps7d, dailyRows] = await Promise.all([
    prisma.organisation.count({ where: { createdAt: { gte: since24h } } }),
    prisma.event.count({ where: { createdAt: { gte: since24h } } }),
    prisma.rSVP.count({ where: { createdAt: { gte: since24h } } }),
    prisma.rSVP.count({ where: { createdAt: { gte: since7d } } }),
    loadDailyActivity(windowStart(7, now)),
  ]);
  const activity7d = fillDailySeries(dailyRows, ["organisations", "events", "rsvps"] as const, 7, now);
  const [recentOrgs, recentEvents, topOrgsByEvents] = await Promise.all([
    prisma.organisation.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, slug: true, createdAt: true },
    }),
    prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        title: true,
        slug: true,
        createdAt: true,
        organisation: { select: { slug: true, name: true } },
      },
    }),
    prisma.organisation.findMany({
      orderBy: { events: { _count: "desc" } },
      take: 10,
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { events: true, memberships: true } },
      },
    }),
  ]);
  // Registrations for exactly the organisations listed (one-off events and
  // series occurrences), so every row has a real count rather than "—".
  const topOrgRsvps = Object.fromEntries(
    await Promise.all(
      topOrgsByEvents.map(async (o) => [
        o.id,
        await prisma.rSVP.count({ where: { OR: [{ event: { organisationId: o.id } }, { eventInstance: { series: { organisationId: o.id } } }] } }),
      ] as const),
    ),
  );
  const stats = [
    { label: "Organisations", value: orgs },
    { label: "Users", value: users },
    { label: "Events", value: events },
    { label: "RSVPs", value: rsvps },
    { label: "Series", value: series },
    { label: "Instances", value: instances },
    { label: "Memberships", value: memberships },
    { label: "Org invite links", value: orgInvites },
    { label: "Check-ins", value: checkIns },
    { label: "Feedback responses", value: feedbackResponses },
    { label: "Broadcasts", value: broadcasts },
    { label: "Active API clients", value: apiClients },
  ];
  const attention = [
    { label: "Failed emails", value: failedEmails, href: "/super-admin/email" },
    { label: "Emails queued over 15 minutes", value: stuckEmails, href: "/super-admin/email" },
    { label: "Owners and admins without MFA", value: managersWithoutMfa, href: "/super-admin/security" },
    { label: "Users with unverified email", value: unverifiedUsers, href: "/super-admin/users?filter=unverified" },
  ];
  return { stats, attention, activity7d, orgs24h, events24h, rsvps24h, rsvps7d, topOrgsByEvents, topOrgRsvps, recentOrgs, recentEvents };
}
