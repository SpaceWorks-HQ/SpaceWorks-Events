import "server-only";

import { alertOnBackupProblems } from "@/lib/backupAlerts";
import { deliverOutboxBatch } from "@/lib/outbox";
import {
  recordOutboxSchedulerFailure,
  recordOutboxSchedulerStarted,
  recordOutboxSchedulerSuccess,
} from "@/lib/operationalHeartbeat";
import { purgeExpiredOperationalData } from "@/lib/retention";
import { runPaymentMaintenance } from "@/lib/payments/maintenance";

const OUTBOX_WORKER_INTERVAL_MS = 60_000;

type OutboxWorkerState = {
  started?: boolean;
  running?: boolean;
  timer?: ReturnType<typeof setInterval>;
};

function workerState() {
  return globalThis as typeof globalThis & { __sweOutboxWorker?: OutboxWorkerState };
}

/** Runs one complete delivery/retention pass and records its operational state. */
export async function runOutboxScheduler() {
  // Heartbeat persistence is observability, not part of the delivery commit.
  // A heartbeat-table issue must not stop otherwise healthy queue processing.
  await recordOutboxSchedulerStarted().catch(() => undefined);
  try {
    // Payment housekeeping runs first so expiry and refund emails go out in this pass.
    const payments = await runPaymentMaintenance().catch(() => {
      console.error("[payments] maintenance pass failed");
      return null;
    });
    const result = await deliverOutboxBatch();
    const purged = await purgeExpiredOperationalData();
    // Observability, like the heartbeat: never let it stop mail delivery.
    await alertOnBackupProblems().catch(() => undefined);
    await recordOutboxSchedulerSuccess(result).catch(() => undefined);
    return { ...result, purged, payments };
  } catch (error) {
    await recordOutboxSchedulerFailure(error).catch(() => undefined);
    throw error;
  }
}

/**
 * Start one polling worker per Node.js process. Queue row claims make this safe
 * across replicas; the singleton guard avoids duplicate timers during dev HMR.
 */
export function startOutboxWorker() {
  const runtime = workerState();
  if (runtime.__sweOutboxWorker?.started) return;

  const state: OutboxWorkerState = { started: true, running: false };
  runtime.__sweOutboxWorker = state;

  const tick = async () => {
    if (state.running) return;
    state.running = true;
    try {
      await runOutboxScheduler();
    } catch {
      // Failure metadata is persisted separately without exception text.
      console.error("[outbox worker] scheduler run failed");
    } finally {
      state.running = false;
    }
  };

  void tick();
  state.timer = setInterval(() => {
    void tick();
  }, OUTBOX_WORKER_INTERVAL_MS);
  state.timer.unref?.();
}
