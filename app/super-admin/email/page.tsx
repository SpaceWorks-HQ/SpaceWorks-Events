import { requireSuperAdminMfa } from "@/lib/permissions";
import Link from "next/link";
import { OutboxStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EMAIL_SERIES, loadDailyEmail, loadTopOrganisationsByBroadcasts } from "@/lib/superAdminData";
import { fillDailySeries, formatShare, outboxByKind, sumPoints, windowStart } from "@/lib/superAdminInsights";
import { SparklineCard } from "@/components/super-admin/Sparkline";
import { AdminPanel, NameCell } from "@/components/super-admin/AdminPanel";
import { Chip, EmptyState, PageHeader, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const WINDOW_DAYS = 14;
const BROADCAST_WINDOW_DAYS = 30;
const STUCK_AFTER_MS = 15 * 60_000;

const seriesLabels: Record<(typeof EMAIL_SERIES)[number], string> = {
  queued: "Queued",
  sent: "Delivered",
  failed: "Failed",
};

const attendanceLabels: Record<string, string> = { ANY: "Everyone", CHECKED_IN: "Checked in", NOT_CHECKED_IN: "Not checked in" };

export default async function SuperAdminEmailPage() {
  // Layout checks don't re-run on client navigation, so every page checks too.
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Email"
        description="Transactional email and broadcast volume from the outbox queue. Recipients and message contents are never shown."
        actions={<Link href="/super-admin/operations" className="text-sm font-semibold text-ink underline underline-offset-4 hover:text-ink-secondary">Delivery controls in Operations</Link>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile className="rounded-2xl" label="Queued now" value={totals.pending.toLocaleString()} />
        <StatTile className="rounded-2xl" label="Waiting over 15 min" value={(stuckPending + stuckProcessing).toLocaleString()} tone={stuckPending + stuckProcessing > 0 ? "attention" : "default"} hint={stuckProcessing > 0 ? `${stuckProcessing} locked by a worker` : undefined} />
        <StatTile className="rounded-2xl" label="Failed" value={totals.failed.toLocaleString()} tone={totals.failed > 0 ? "attention" : "default"} hint={`${formatShare(totals.failed, totals.total)} of all messages`} />
        <StatTile className="rounded-2xl" label="Delivered (retained)" value={totals.sent.toLocaleString()} hint="Link-bearing messages are deleted after delivery" />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {EMAIL_SERIES.map((name) => (
          <SparklineCard key={name} title={seriesLabels[name]} subtitle={`Last ${WINDOW_DAYS} days`} total={sumPoints(daily[name])} points={daily[name]} />
        ))}
      </div>

      <AdminPanel title="By message type" description="Every message still in the outbox, grouped by kind. Messages that carry a ticket, reset, or invite link are deleted once delivered, so delivered counts are a lower bound.">
        {kinds.length === 0 ? (
          <EmptyState mood="sleepy">No messages in the outbox.</EmptyState>
        ) : (
          <Table label="Outbox messages by kind">
            <THead>
              <tr>
                <TH>Kind</TH>
                <TH className="text-right">Queued</TH>
                <TH className="text-right">Sending</TH>
                <TH className="text-right">Delivered</TH>
                <TH className="text-right">Failed</TH>
                <TH className="text-right">Failure rate</TH>
              </tr>
            </THead>
            <TBody>
              {kinds.map((row) => (
                <TR key={row.kind}>
                  <TD className="font-mono text-sm">{row.kind}</TD>
                  <TD className="text-right tabular-nums">{row.pending.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{row.processing.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{row.sent.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{row.failed > 0 ? <Chip size="sm" tone="danger">{row.failed.toLocaleString()}</Chip> : "0"}</TD>
                  <TD className="text-right tabular-nums text-ink-secondary">{formatShare(row.failed, row.total)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </AdminPanel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <AdminPanel title="Top broadcasters" description={`${broadcastsCount.toLocaleString()} broadcast${broadcastsCount === 1 ? "" : "s"} in the last ${BROADCAST_WINDOW_DAYS} days.`}>
          {topBroadcasters.length === 0 ? (
            <EmptyState mood="sleepy">No broadcasts in this period.</EmptyState>
          ) : (
            <Table label="Organisations by broadcasts sent">
              <THead>
                <tr>
                  <TH>Organisation</TH>
                  <TH className="text-right">Broadcasts</TH>
                  <TH className="text-right">Recipients</TH>
                </tr>
              </THead>
              <TBody>
                {topBroadcasters.map((org) => (
                  <TR key={org.id}>
                    <TD><NameCell href={`/super-admin/orgs/${org.id}`} name={org.name} sub={`/${org.slug}`} /></TD>
                    <TD className="text-right tabular-nums">{Number(org.broadcasts).toLocaleString()}</TD>
                    <TD className="text-right tabular-nums">{Number(org.recipients).toLocaleString()}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </AdminPanel>

        <AdminPanel title="Recent broadcasts" description="Subject and audience only.">
          {broadcasts.length === 0 ? (
            <EmptyState mood="sleepy">No broadcasts sent yet.</EmptyState>
          ) : (
            <Table label="Recent broadcasts">
              <THead>
                <tr>
                  <TH>Subject</TH>
                  <TH>Audience</TH>
                  <TH className="text-right">Recipients</TH>
                  <TH>Sent</TH>
                </tr>
              </THead>
              <TBody>
                {broadcasts.map((broadcast) => (
                  <TR key={broadcast.id}>
                    <TD className="align-top">
                      <NameCell name={broadcast.subject} sub={<Link href={`/super-admin/orgs/${broadcast.event.organisation.id}`} className="underline-offset-4 hover:underline">{`${broadcast.event.organisation.name} · ${broadcast.event.title}`}</Link>} />
                    </TD>
                    <TD className="align-top text-sm text-ink-secondary">{`${broadcast.statuses.map((status) => status.toLowerCase().replace("_", " ")).join(", ")} · ${attendanceLabels[broadcast.attendance] ?? broadcast.attendance}`}</TD>
                    <TD className="align-top text-right tabular-nums">{broadcast.recipientCount.toLocaleString()}</TD>
                    <TD className="align-top whitespace-nowrap text-ink-secondary">{broadcast.createdAt.toLocaleString()}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </AdminPanel>
      </div>
    </div>
  );
}
