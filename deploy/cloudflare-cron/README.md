# Space Works Events cron Worker

A Cloudflare Worker with a Cron Trigger (`* * * * *`). Every minute it:

1. `GET {APP_URL}/api/health` wakes the app if the Render free instance is
   asleep (cold starts take about 30–60 s; the Worker waits up to 90 s).
2. `POST {APP_URL}/api/internal/outbox` with `Authorization: Bearer
   {CRON_SECRET}` runs every timed job once (payment holds and reminders,
   waitlists, event reminders, retention, backup alerts), then sends queued email.

While it is awake, the app also sends email within seconds and runs the same
jobs itself (`SWE_PROCESS_ROLE=all`). Both paths can run at once safely,
because outbox rows are claimed atomically and every job is safe to repeat.
The Worker covers the time the instance would otherwise sleep, and its
once-a-minute database query keeps a free Supabase project from pausing.

This folder is a separate package: it is excluded from the app's TypeScript,
ESLint, Vitest and Docker build, and its only dependency is `wrangler`.

## Deploy

```bash
cd deploy/cloudflare-cron
npm ci
npx wrangler login
npx wrangler secret put APP_URL       # e.g. https://events.example.org (https, no trailing slash)
npx wrangler secret put CRON_SECRET   # the same value as the app's CRON_SECRET
npx wrangler deploy
```

`wrangler.toml` sets `workers_dev = false`, so the Worker has no public URL.
It only runs on its schedule.

## Operate

- `npx wrangler tail` streams logs. Expect `health 200` and `outbox 200`
  every minute. Only status codes are logged, never the secret or response
  bodies.
- `outbox 404`: `CRON_SECRET` differs from the app's value.
- `outbox 500`: the app could not complete the pass (database or SMTP). Check
  the Render logs and the worker and beat heartbeats under Super admin.
- After rotating the app's `CRON_SECRET`, run `wrangler secret put
  CRON_SECRET` again.
- `npm run check` bundles the Worker without deploying it (`wrangler deploy
  --dry-run`).

Cloudflare's free Workers plan allows 100,000 requests a day; this Worker uses
about 1,440 scheduled runs a day.
