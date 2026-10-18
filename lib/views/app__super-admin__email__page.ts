import { requireSuperAdminMfa } from "@/lib/permissions";
import { OutboxStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EMAIL_SERIES, loadDailyEmail, loadTopOrganisationsByBroadcasts } from "@/lib/superAdminData";
import { fillDailySeries, outboxByKind, windowStart } from "@/lib/superAdminInsights";
const WINDOW_DAYS = 14;
const BROADCAST_WINDOW_DAYS = 30;
const STUCK_AFTER_MS = 15 * 60_000;



export async function loadSuperAdminEmailView() {
  await requireSuperAdminMfa();
  const now = new Date();
  const since = windowStart(WINDOW_DAYS, now);
  const [kindGroups, dailyRows, stuckPending, stuckProcessing, broadcasts, broadcastsCount, topBroadcasters] = await Promise.all([
    prisma.outboxMessage.groupBy({ by: ["kind", "status"], _count: { _all: true } }),
    loadDailyEmail(since),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.PENDING, availableAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } } }),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.PROCESSING, lockedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } } }),
    prisma.eventBroadcast.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      // Subject and audience only: the body, recipients, and sender are not loaded.
      select: {
        id: true,
        subject: true,
        design: true,
        statuses: true,
        attendance: true,
        recipientCount: true,
        createdAt: true,
        event: { select: { title: true, organisation: { select: { id: true, name: true } } } },
      },
    }),
    prisma.eventBroadcast.count({ where: { createdAt: { gte: windowStart(BROADCAST_WINDOW_DAYS, now) } } }),
    loadTopOrganisationsByBroadcasts(windowStart(BROADCAST_WINDOW_DAYS, now)).catch(() => []),
  ]);
  const kinds = outboxByKind(kindGroups.map((group) => ({ kind: group.kind, status: group.status, count: group._count._all })));
  const daily = fillDailySeries(dailyRows, EMAIL_SERIES, WINDOW_DAYS, now);
  const totals = kinds.reduce((sum, row) => ({ pending: sum.pending + row.pending, failed: sum.failed + row.failed, sent: sum.sent + row.sent, total: sum.total + row.total }), { pending: 0, failed: 0, sent: 0, total: 0 });
  return { totals, stuckPending, stuckProcessing, daily, kinds, broadcastsCount, topBroadcasters, broadcasts };
}
