import "server-only";

import { prisma } from "@/lib/db";
import { describeOperationalError } from "@/lib/redactSensitiveText";

/** The worker's email delivery (also the `/api/internal/outbox` recovery pass). */
export const OUTBOX_SCHEDULER_HEARTBEAT_KEY = "outbox-scheduler";
/** The beat's timed jobs. `lastFailed` counts jobs that failed in the last run. */
export const BEAT_HEARTBEAT_KEY = "beat";

// During a rolling deployment (or a Turbopack restart after a migration), an
// older generated Prisma client can briefly be alive without this delegate.
// Do not block mail delivery merely because its optional observability row
// cannot be written yet.
type OperationalHeartbeatDelegate = Pick<typeof prisma.operationalHeartbeat, "upsert">;

function getHeartbeatDelegate(): OperationalHeartbeatDelegate | undefined {
  return (prisma as unknown as { operationalHeartbeat?: OperationalHeartbeatDelegate })
    .operationalHeartbeat;
}

export async function recordHeartbeatStarted(key: string) {
  const heartbeat = getHeartbeatDelegate();
  if (!heartbeat) return;
  await heartbeat.upsert({
    where: { key },
    create: { key, lastStartedAt: new Date() },
    update: { lastStartedAt: new Date() },
  });
}

export async function recordHeartbeatSuccess(key: string, result: { sent: number; failed: number }) {
  const heartbeat = getHeartbeatDelegate();
  if (!heartbeat) return;
  const now = new Date();
  await heartbeat.upsert({
    where: { key },
    create: {
      key,
      lastStartedAt: now,
      lastSucceededAt: now,
      lastSent: result.sent,
      lastFailed: result.failed,
    },
    update: {
      lastSucceededAt: now,
      lastSent: result.sent,
      lastFailed: result.failed,
      lastError: null,
    },
  });
}

export async function recordHeartbeatFailure(key: string, error: unknown) {
  const heartbeat = getHeartbeatDelegate();
  if (!heartbeat) return;
  const message = describeOperationalError(error);
  await heartbeat.upsert({
    where: { key },
    create: {
      key,
      lastStartedAt: new Date(),
      lastError: message,
    },
    update: { lastError: message },
  });
}
