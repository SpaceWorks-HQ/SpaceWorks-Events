import { requireSuperAdminMfa } from "@/lib/permissions";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { OutboxStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { InstanceOperationsControls } from "@/components/super-admin/InstanceOperationsControls";
import { OUTBOX_SCHEDULER_HEARTBEAT_KEY } from "@/lib/operationalHeartbeat";
import { redactSensitiveText } from "@/lib/redactSensitiveText";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { AdminPanel } from "@/components/super-admin/AdminPanel";
import { Callout, Chip, EmptyState, PageHeader } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

function StatusChip(props: { ok: boolean; ready: string; missing: string }) {
  return <Chip tone={props.ok ? "success" : "warning"} icon={props.ok ? <CheckCircle2 /> : <AlertTriangle />} className="whitespace-normal">{props.ok ? props.ready : props.missing}</Chip>;
}

function ageLabel(value: Date | null) {
  if (!value) return "Not recorded";
  const hours = Math.max(0, Math.floor((Date.now() - value.getTime()) / 3_600_000));
  if (hours < 1) return "Less than an hour ago";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function safeErrorSummary(value: string | null) {
  return value ? redactSensitiveText(value).slice(0, 500) : "No error detail recorded.";
}

export default async function SuperAdminOperationsPage() {
  // Layout checks don't re-run on client navigation, so every page checks too.
  await requireSuperAdminMfa();
  const now = new Date();
  const heartbeat = (prisma as unknown as {
    operationalHeartbeat?: Pick<typeof prisma.operationalHeartbeat, "findUnique">;
  }).operationalHeartbeat;
  const [outboxGroups, expiredTokens, lastRestoreDrill, oldestPending, schedulerHeartbeat, failedMessages, instanceSettings] = await Promise.all([
    prisma.outboxMessage.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.verificationToken.count({ where: { expires: { lt: now } } }),
    prisma.auditEvent.findFirst({
      where: { action: "BACKUP_RESTORE_VERIFIED" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.outboxMessage.findFirst({
      where: { status: OutboxStatus.PENDING },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    heartbeat
      ? heartbeat.findUnique({
          where: { key: OUTBOX_SCHEDULER_HEARTBEAT_KEY },
          select: {
            lastStartedAt: true,
            lastSucceededAt: true,
            lastSent: true,
            lastFailed: true,
            lastError: true,
          },
        })
      : Promise.resolve(null),
    prisma.outboxMessage.findMany({
      where: { status: OutboxStatus.FAILED },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, kind: true, attempts: true, lastError: true, createdAt: true },
    }),
    prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID } }),
  ]);
  const outbox = new Map(outboxGroups.map((row) => [row.status, row._count._all]));
  const backupProvider = instanceSettings?.backupProvider ?? env?.BACKUP_PROVIDER;
  const backupRetentionDays = instanceSettings?.backupRetentionDays ?? env?.BACKUP_RETENTION_DAYS;
  const reportedBackupAt = instanceSettings?.backupLastSuccessAt ?? (env?.BACKUP_LAST_SUCCESS_AT ? new Date(env.BACKUP_LAST_SUCCESS_AT) : null);
  const backupFresh = reportedBackupAt != null && now.getTime() - reportedBackupAt.getTime() < 26 * 3_600_000;
  const schedulerFresh = schedulerHeartbeat?.lastSucceededAt != null
    && now.getTime() - schedulerHeartbeat.lastSucceededAt.getTime() < 3 * 60_000;

  const failedCount = outbox.get(OutboxStatus.FAILED) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Operations" description="Backup posture, queue health, retention jobs, and safe maintenance controls for this deployment." />

      <div className="grid gap-6 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <AdminPanel title="Database backups">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <StatusChip ok={Boolean(backupProvider)} ready={`Provider: ${backupProvider}`} missing="Backup provider not configured" />
              <StatusChip ok={backupFresh} ready="Latest backup is fresh" missing="Backup status is stale or unknown" />
              <StatusChip ok={Boolean(backupRetentionDays)} ready={`${backupRetentionDays} day retention`} missing="Retention not configured" />
            </div>
            <p className="text-sm text-ink-secondary">Last successful backup: {reportedBackupAt ? `${reportedBackupAt.toLocaleString()} (${ageLabel(reportedBackupAt)})` : "not reported by the backup job"}.</p>
            <p className="text-sm text-ink-secondary">Last restore drill: {lastRestoreDrill ? `${lastRestoreDrill.createdAt.toLocaleString()} (${ageLabel(lastRestoreDrill.createdAt)})` : "not recorded"}.</p>
            <p className="text-caption text-ink-muted">Update backup posture in Instance settings; backup creation remains external to the application.</p>
          </div>
        </AdminPanel>
        <AdminPanel title="Service prerequisites">
          <div className="flex flex-col items-start gap-2">
            <StatusChip ok={Boolean(env?.REDIS_URL)} ready="Redis configured" missing="Redis missing — production writes will fail closed" />
            <StatusChip ok={Boolean(process.env.CRON_SECRET)} ready="Outbox scheduler secret configured" missing="Outbox scheduler secret missing" />
            <StatusChip ok={Boolean(process.env.HEALTHCHECK_SECRET)} ready="Readiness probe protected" missing="Readiness probe secret missing" />
            <StatusChip ok={Boolean(instanceSettings?.smtpHost || instanceSettings?.smtpService || env?.SMTP_HOST || env?.SMTP_SERVICE)} ready="Transactional email configured" missing="Transactional email not configured" />
          </div>
        </AdminPanel>
      </div>

      <AdminPanel title="Delivery and retention">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Chip>{`${outbox.get(OutboxStatus.PENDING) ?? 0} queued`}</Chip>
            <Chip tone={failedCount > 0 ? "danger" : "success"}>{`${failedCount} failed`}</Chip>
            <Chip tone="outline">{`${outbox.get(OutboxStatus.SENT) ?? 0} sent`}</Chip>
            <Chip tone={expiredTokens > 0 ? "warning" : "success"}>{`${expiredTokens} expired verification token${expiredTokens === 1 ? "" : "s"}`}</Chip>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusChip ok={schedulerFresh} ready="Outbox scheduler healthy" missing="Outbox scheduler stale or unknown" />
            {schedulerHeartbeat ? <Chip tone="outline">{`Last batch: ${schedulerHeartbeat.lastSent} sent, ${schedulerHeartbeat.lastFailed} failed`}</Chip> : null}
          </div>
          <p className="text-sm text-ink-secondary">
            Last scheduler success: {schedulerHeartbeat?.lastSucceededAt ? `${schedulerHeartbeat.lastSucceededAt.toLocaleString()} (${ageLabel(schedulerHeartbeat.lastSucceededAt)})` : "not recorded"}.
          </p>
          <p className="text-sm text-ink-secondary">
            Last scheduler start: {schedulerHeartbeat?.lastStartedAt ? `${schedulerHeartbeat.lastStartedAt.toLocaleString()} (${ageLabel(schedulerHeartbeat.lastStartedAt)})` : "not recorded"}.
          </p>
          {schedulerHeartbeat?.lastError ? <p className="text-sm text-danger-fg">Last scheduler error: {safeErrorSummary(schedulerHeartbeat.lastError)}</p> : null}
          <p className="text-sm text-ink-secondary">Oldest queued message: {oldestPending ? `${oldestPending.createdAt.toLocaleString()} (${ageLabel(oldestPending.createdAt)})` : "none"}.</p>
          <div className="mt-1 border-t border-line pt-4">
            <InstanceOperationsControls />
          </div>
        </div>
      </AdminPanel>

      <AdminPanel title="Failed email deliveries" description="Recipient addresses, message payloads, and bearer links are never shown here.">
        {failedMessages.length === 0 ? (
          <EmptyState mood="sleepy">No failed email deliveries.</EmptyState>
        ) : (
          <Table label="Failed email deliveries">
            <THead>
              <tr>
                <TH>Kind</TH>
                <TH>Attempts</TH>
                <TH>Failed</TH>
                <TH>Last error</TH>
              </tr>
            </THead>
            <TBody>
              {failedMessages.map((message) => (
                <TR key={message.id}>
                  <TD className="align-top font-mono text-sm">{message.kind}</TD>
                  <TD className="align-top tabular-nums">{message.attempts}</TD>
                  <TD className="align-top whitespace-nowrap text-ink-secondary">{message.createdAt.toLocaleString()}</TD>
                  <TD className="align-top text-ink-secondary [overflow-wrap:anywhere]">{safeErrorSummary(message.lastError)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </AdminPanel>

      <Callout tone="info" title="Operational guardrail" className="rounded-2xl">
        These controls do not create or delete provider backups. Backup creation, retention, encryption, and restore access must remain controlled by the managed database provider and deployment credentials. Use this page to verify posture and record evidence, not to expose infrastructure secrets in the application.
      </Callout>
    </div>
  );
}
