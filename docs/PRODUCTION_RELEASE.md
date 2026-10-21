# Production release checklist

[Documentation index](README.md)

Space Works Events must not be released until every item below is complete and recorded in the deployment change.

The default deployment is the [free-tier cloud stack](DEPLOYMENT_CLOUD.md): Render (app), Supabase (PostgreSQL), Upstash (Redis), Cloudflare R2 (storage), Brevo (SMTP), and a Cloudflare Worker (scheduler). It satisfies the TLS, private-storage, authenticated-SMTP, and background-job requirements below. It does **not** provide point-in-time recovery, provider backups, or alerting on the free plans: take operator backups (`DATABASE_URL="$DIRECT_URL" npm run db:backup`) and add an uptime monitor for `/api/health`, or upgrade those services before holding real attendee data at scale.

## Required managed services

- PostgreSQL with TLS, encryption at rest, daily backups, point-in-time recovery, and a documented restore drill.
- Redis configured through `REDIS_URL`. The application deliberately rejects security-sensitive traffic when Redis is unavailable in production.
- Private S3-compatible object storage configured with `S3_BUCKET` and `S3_REGION`. Use an IAM workload role where possible; keep the bucket private.
- A transactional email provider with a verified sending domain, SPF, DKIM, DMARC, bounce handling, and alerting.
- The email worker (sends queued email within seconds) and the beat (timed jobs: payment holds and reminders, waitlists, event reminders, retention, backup alerts) run in the application process by default, or as separate `worker` and `beat` containers (`SWE_PROCESS_ROLE`). Keep `POST /api/internal/outbox` with `Authorization: Bearer $CRON_SECRET` available for cron services and recovery, and monitor both heartbeats.
- WAF/CDN and TLS termination in front of the app. Forward only the configured trusted client-IP header.
- Centralized PII-scrubbed logs, error reporting, uptime checks, and alerts for database, Redis, outbox, mail, and backup failures.

## Deployment procedure

1. Configure the canonical production hostname. Set both `AUTH_URL` and `NEXT_PUBLIC_BASE_URL` to the same HTTPS origin (for example `https://events.example.com`); they must match exactly. Configure DNS, a valid TLS certificate, CDN/WAF origin routing, and the trusted proxy-IP header.
2. If Google OAuth is enabled, register `https://events.example.com/api/auth/callback/google` (your origin) as an authorized callback URL.
3. Review and approve the Prisma migration; take a backup before applying it. The secure-token migration rotates existing ticket and certificate links.
4. Run `npm ci`, `npm run production:check`, `npm run db:deploy`, `npm run db:verify`, `npm run storage:migrate`, `npm run lint`, `npx tsc --noEmit`, `npm run test:coverage`, and `npm run build` in staging.
5. Exercise auth, organisation permissions, RSVP capacity, duplicate RSVP, upload rejection, email delivery, and offline-check-in sync in staging.
6. Build an immutable image with `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` supplied as a BuildKit secret (Render: as the service environment variable, which Render passes as a build arg), inject that same value at runtime, run the authenticated `/api/health/db` readiness probe, and verify the worker and beat heartbeats.
7. Confirm alert delivery and record the release, backup point, migration version, and rollback owner.

## Breaking changes from Yuyu

Space Works Events is deployed fresh; it does not read state written by a Yuyu instance. Moving an existing Yuyu database or clients across is not supported without re-issuing the following:

- **Machine API tokens** use the `swe_v1_` prefix. `yuyu_v1_` tokens are rejected; create new API clients.
- **Check-in station PINs** are encrypted under the HKDF info `swe-check-in-station-pin-v2`. Stored Yuyu station PINs no longer decrypt; set station PINs again.
- **Browser keys** were renamed from `yuyu.`/`yuyu:` to `swe.`/`swe:`: the check-in station cookie (`swe.check-in-station.v2`), the colour-mode cookie and storage key (`swe.color-mode`, `swe:color-mode`), saved RSVP state (`swe:rsvp:*`) and the check-in desk's badge settings (`swe:checkin:id-card:*`). Browsers start with defaults. The Auth.js session cookie names are unchanged. The staff authenticator proof cookie is `swe.mfa-proof.v1`.
- **Redis** publishes live check-in updates on `swe:ticket-checkin:<rsvpId>`. Do not share a Redis instance between a Yuyu and a Space Works Events deployment.
- **Outbox email** `Message-ID`s are `<swe-<id>@outbox.invalid>`.

## Domain changes

When replacing the current hostname, update the two canonical URL variables, OAuth callback/origin settings, DNS, TLS, CDN/WAF, scheduler, monitoring targets, and any trusted host configuration in one deployment. Rebuild the application because public environment values are embedded at build time. Preserve an HTTPS redirect from the old host so shared event, ticket, certificate, and invitation links continue to work; users may need to sign in again because cookies are host-specific.

## Required operating controls

- Publish privacy, cookie, acceptable-use, retention, and incident-response policies.
- Define organiser data export approvals, account export/delete handling, retention periods, and a subprocessor register.
- Run periodic restore drills, access reviews, dependency scans, load tests, and security tests.
- Organisation staff must set up authenticator MFA from `/account/security` and confirm it each session; keep `STAFF_MFA_REQUIRED`, `LOGIN_NEW_DEVICE_CHECK` and `PWNED_PASSWORDS_CHECK` unset (on) in production. The super admin signs in with email and password set from the server, with no separate step-up; enabling authenticator MFA on that account is recommended. Session revocation is available from the same page.
- Set `TRUSTED_PROXY_IP_HEADER` to the one client-IP header your CDN overwrites; do not expose the application directly to the internet behind an arbitrary forwarded header. A client whose request lacks that header reads as "unknown", and the per-address sign-in block never applies to it.
- Allow outbound HTTPS to `api.pwnedpasswords.com` so the breached-password check works; it lets passwords through when the service can't be reached.
- Preserve `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` across every container serving a release. Rotating it invalidates outstanding Server Action forms.

## Cover-image safety

Cover images are signature/pixel validated, decoded, metadata-stripped, resized, and re-encoded as WebP before entering a private object-store bucket. Only generated derivatives are delivered through the application. Run `npm run storage:migrate` once after configuring S3 to remove legacy database blobs.
