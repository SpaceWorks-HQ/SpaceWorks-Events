import { requireSuperAdminMfa } from "@/lib/permissions";
import { loadSuperAdminEmailView } from "@/lib/views/app__super-admin__email__page";
import Link from "next/link";
import { EMAIL_SERIES } from "@/lib/superAdminSeries";
import { formatShare, sumPoints } from "@/lib/superAdminInsights";
import { SparklineCard } from "@/components/super-admin/Sparkline";
import { AdminPanel, NameCell } from "@/components/super-admin/AdminPanel";
import { Chip, EmptyState, PageHeader, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const WINDOW_DAYS = 14;
const BROADCAST_WINDOW_DAYS = 30;


const seriesLabels: Record<(typeof EMAIL_SERIES)[number], string> = {
  queued: "Queued",
  sent: "Delivered",
  failed: "Failed",
};

const attendanceLabels: Record<string, string> = { ANY: "Everyone", CHECKED_IN: "Checked in", NOT_CHECKED_IN: "Not checked in" };

export default async function SuperAdminEmailPage() {
  await requireSuperAdminMfa();
  const { totals, stuckPending, stuckProcessing, daily, kinds, broadcastsCount, topBroadcasters, broadcasts } = await loadSuperAdminEmailView();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Email"
        description="Transactional email and broadcast volume from the outbox queue. Recipients and message contents are never shown."
        actions={<Link href="/super-admin/operations" className="text-sm font-semibold text-ink underline underline-offset-4 hover:text-ink-secondary">Delivery controls in Operations</Link>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile className="rounded-xl" label="Queued now" value={totals.pending.toLocaleString()} />
        <StatTile className="rounded-xl" label="Waiting over 15 min" value={(stuckPending + stuckProcessing).toLocaleString()} tone={stuckPending + stuckProcessing > 0 ? "attention" : "default"} hint={stuckProcessing > 0 ? `${stuckProcessing} locked by a worker` : undefined} />
        <StatTile className="rounded-xl" label="Failed" value={totals.failed.toLocaleString()} tone={totals.failed > 0 ? "attention" : "default"} hint={`${formatShare(totals.failed, totals.total)} of all messages`} />
        <StatTile className="rounded-xl" label="Delivered (retained)" value={totals.sent.toLocaleString()} hint="Link-bearing messages are deleted after delivery" />
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
                  <TD className="tabular-nums text-sm">{row.kind}</TD>
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
