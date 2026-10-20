import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

/**
 * The VPS installer's backup status (scripts/vps-backup.sh writes
 * $SWE_CONFIG_DIR/status/backup.json; Compose mounts it read-only and sets
 * SWE_STATUS_DIR). Other deployments have none, and this returns null.
 */
const timestamp = z.iso.datetime();
const statusSchema = z.object({
  version: z.literal(1),
  lastAttemptAt: timestamp,
  lastStatus: z.enum(["ok", "failed"]),
  lastKind: z.enum(["full", "database"]),
  lastSuccessAt: timestamp.nullable(),
  lastFullSuccessAt: timestamp.nullable(),
  sizeBytes: z.number().int().nonnegative(),
  encrypted: z.boolean(),
  offsite: z.enum(["off", "ok", "failed"]),
  scheduled: z.boolean(),
  keepDays: z.number().int().positive(),
});
export type VpsBackupStatus = z.infer<typeof statusSchema>;

export async function readVpsBackupStatus(): Promise<VpsBackupStatus | null> {
  const dir = process.env.SWE_STATUS_DIR;
  if (!dir) return null;
  try {
    const parsed = statusSchema.safeParse(JSON.parse(await readFile(join(dir, "backup.json"), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Hours after which a scheduled installation's newest full backup counts as stale. */
export const STALE_BACKUP_HOURS = 36;

export type BackupProblem = { key: string; subject: string; detail: string };

/**
 * What needs a super admin's attention, if anything. The key identifies the
 * occurrence, so each failure (and each stale day) is reported once.
 */
export function backupProblem(status: VpsBackupStatus | null, now = new Date()): BackupProblem | null {
  if (!status) return null;
  if (status.lastStatus === "failed") {
    const offsite = status.offsite === "failed";
    return {
      key: `failed:${status.lastAttemptAt}`,
      subject: offsite ? "Backup could not be copied off-site" : "Backup failed",
      detail: offsite
        ? `The backup at ${status.lastAttemptAt} was saved on the server but could not be copied to the off-site bucket.`
        : `The backup at ${status.lastAttemptAt} failed.`,
    };
  }
  const newest = status.lastFullSuccessAt ?? status.lastSuccessAt;
  if (status.scheduled && (!newest || now.getTime() - Date.parse(newest) > STALE_BACKUP_HOURS * 3_600_000)) {
    return {
      key: `stale:${now.toISOString().slice(0, 10)}`,
      subject: "No recent backup",
      detail: newest ? `The newest full backup is from ${newest}; nightly backups should have run since.` : "Nightly backups are scheduled but none has finished yet.",
    };
  }
  return null;
}
