/**
 * Space Works Events scheduler (Cloudflare Worker, Cron Trigger every minute).
 *
 * The Render free instance sleeps after 15 idle minutes, which also stops the
 * app's in-process outbox worker. Each run:
 *   1. GET  {APP_URL}/api/health            wakes the app (cold start ~30-60 s)
 *   2. POST {APP_URL}/api/internal/outbox   delivers queued email and runs
 *                                           retention cleanup (Bearer CRON_SECRET)
 * Because step 2 queries the database every minute, it also keeps a free
 * Supabase project from pausing for inactivity.
 *
 * Secrets (set with `wrangler secret put`): APP_URL, CRON_SECRET.
 * Never log the secret or full responses; only status codes are logged.
 */

interface Env {
  APP_URL: string;
  CRON_SECRET: string;
}

// Minimal local shapes so this folder needs no type packages beyond wrangler.
interface ScheduledController {
  readonly cron: string;
  readonly scheduledTime: number;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const WAKE_TIMEOUT_MS = 90_000;
const OUTBOX_TIMEOUT_MS = 60_000;

function appOrigin(value: string | undefined): string {
  const url = new URL(value ?? "");
  if (url.protocol !== "https:") throw new Error("APP_URL must be an https:// origin");
  return url.origin;
}

async function call(url: string, init: RequestInit, timeoutMs: number): Promise<number> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  // Drain the body so the connection is released; its content is not logged.
  await response.arrayBuffer();
  return response.status;
}

async function run(env: Env): Promise<void> {
  const origin = appOrigin(env.APP_URL);
  if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) throw new Error("CRON_SECRET is missing or too short");

  try {
    const status = await call(`${origin}/api/health`, { headers: { "User-Agent": "spaceworks-events-cron" } }, WAKE_TIMEOUT_MS);
    console.log(`health ${status}`);
  } catch (error) {
    // Still attempt the outbox call; it will also wake a sleeping instance.
    console.warn(`health failed: ${error instanceof Error ? error.name : "error"}`);
  }

  const status = await call(`${origin}/api/internal/outbox`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CRON_SECRET}`, "User-Agent": "spaceworks-events-cron" },
  }, OUTBOX_TIMEOUT_MS);
  console.log(`outbox ${status}`);
  // 404 means the bearer secret does not match the app's CRON_SECRET.
  if (status !== 200) throw new Error(`outbox returned ${status}`);
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(run(env));
  },
};
