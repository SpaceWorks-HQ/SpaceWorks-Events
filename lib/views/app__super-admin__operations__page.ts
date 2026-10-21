import { requireSuperAdminMfa } from "@/lib/permissions";
import { OutboxStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { BEAT_HEARTBEAT_KEY, OUTBOX_SCHEDULER_HEARTBEAT_KEY } from "@/lib/operationalHeartbeat";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { backupProblem, readVpsBackupStatus } from "@/lib/vpsBackupStatus";
export async function loadSuperAdminOperationsView() {
  await requireSuperAdminMfa();
  const now = new Date();
  const heartbeat = (prisma as unknown as {
    operationalHeartbeat?: Pick<typeof prisma.operationalHeartbeat, "findUnique">;
  }).operationalHeartbeat;
  const [outboxGroups, expiredTokens, lastRestoreDrill, oldestPending, schedulerHeartbeat, failedMessages, instanceSettings, beatHeartbeat] = await Promise.all([
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
    prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID }, select: { backupProvider: true, backupRetentionDays: true, backupLastSuccessAt: true, smtpHost: true, smtpService: true } }),
    heartbeat
      ? heartbeat.findUnique({ where: { key: BEAT_HEARTBEAT_KEY }, select: { lastSucceededAt: true, lastFailed: true } })
      : Promise.resolve(null),
  ]);
  const outbox = new Map(outboxGroups.map((row) => [row.status, row._count._all]));
  const backupProvider = instanceSettings?.backupProvider ?? env?.BACKUP_PROVIDER;
  const backupRetentionDays = instanceSettings?.backupRetentionDays ?? env?.BACKUP_RETENTION_DAYS;
  const reportedBackupAt = instanceSettings?.backupLastSuccessAt ?? (env?.BACKUP_LAST_SUCCESS_AT ? new Date(env.BACKUP_LAST_SUCCESS_AT) : null);
  const backupFresh = reportedBackupAt != null && now.getTime() - reportedBackupAt.getTime() < 26 * 3_600_000;
  const schedulerFresh = schedulerHeartbeat?.lastSucceededAt != null
    && now.getTime() - schedulerHeartbeat.lastSucceededAt.getTime() < 3 * 60_000;
  // The beat checks every 15 seconds and records a run at least once a minute.
  const beatFresh = beatHeartbeat?.lastSucceededAt != null
    && now.getTime() - beatHeartbeat.lastSucceededAt.getTime() < 3 * 60_000;
  const failedCount = outbox.get(OutboxStatus.FAILED) ?? 0;
  const prerequisites = { redis: Boolean(env?.REDIS_URL), scheduler: Boolean(process.env.CRON_SECRET), readiness: Boolean(process.env.HEALTHCHECK_SECRET), smtp: Boolean(instanceSettings?.smtpHost || instanceSettings?.smtpService || env?.SMTP_HOST || env?.SMTP_SERVICE) };
  // The VPS installer's own backups, when this runs from it (null elsewhere).
  const serverBackup = await readVpsBackupStatus();
  const serverBackupProblem = backupProblem(serverBackup, now);
  return { prerequisites, backupProvider, backupFresh, backupRetentionDays, reportedBackupAt, lastRestoreDrill, outbox, failedCount, expiredTokens, schedulerFresh, schedulerHeartbeat, beatFresh, beatHeartbeat, oldestPending, failedMessages, serverBackup, serverBackupProblem };
}
