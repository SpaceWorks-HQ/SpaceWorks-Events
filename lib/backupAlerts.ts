import "server-only";

import { prisma } from "@/lib/db";
import { enqueueOperatorNotice } from "@/lib/outbox";
import { backupProblem, readVpsBackupStatus } from "@/lib/vpsBackupStatus";

const ALERT_KEY = "vps-backup-alert";

/**
 * Email the super admin once per backup failure, and once a day while
 * scheduled backups are stale. Runs with the outbox scheduler; installations
 * without the VPS installer's status file do nothing. The heartbeat row records
 * the last occurrence reported, so concurrent schedulers send it only once.
 */
export async function alertOnBackupProblems(now = new Date()) {
  const to = process.env.SUPER_ADMIN_EMAIL;
  if (!to) return;
  const problem = backupProblem(await readVpsBackupStatus(), now);
  if (!problem) return;
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.operationalHeartbeat.updateMany({
      where: { key: ALERT_KEY, OR: [{ lastError: null }, { lastError: { not: problem.key } }] },
      data: { lastError: problem.key, lastStartedAt: now },
    });
    if (claimed.count === 0) {
      if (await tx.operationalHeartbeat.findUnique({ where: { key: ALERT_KEY }, select: { key: true } })) return;
      await tx.operationalHeartbeat.create({ data: { key: ALERT_KEY, lastError: problem.key, lastStartedAt: now } });
    }
    await enqueueOperatorNotice(tx, {
      to,
      subject: `Space Works Events: ${problem.subject}`,
      lines: [
        problem.detail,
        "On the server, run the installer again and choose “Check status and health”, or open Super admin → Operations.",
      ],
    });
  });
}
