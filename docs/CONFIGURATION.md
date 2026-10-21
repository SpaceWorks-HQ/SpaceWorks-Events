# Configuration

[Documentation index](README.md)

Copy `.env.example` to `.env` for local development. For the default free-tier production stack (Render, Supabase, Upstash, Cloudflare R2, Brevo), start from `.env.production.example` and follow [Free-tier cloud deployment](DEPLOYMENT_CLOUD.md). Production secrets must come from a secrets manager or the deployment platform, never from a committed file.

## Core and authentication

| Variable | Production | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Required | Runtime PostgreSQL URL; production requires `sslmode=require`, `verify-ca`, or `verify-full`. Through a transaction pooler (Supabase Supavisor on port 6543) it must include `pgbouncer=true`; add `connection_limit=5` to cap Prisma's pool |
| `DIRECT_URL` | Required with a pooler | Direct or session-mode PostgreSQL URL used only by `prisma migrate` (schema `directUrl`); TLS required when set. Prisma needs the variable to exist, so `npm run db:*`, the migrator image and the container entrypoint fall back to `DATABASE_URL` when it is unset. Local `.env` files should set it to the same value as `DATABASE_URL` for direct `npx prisma` commands |
| `MIGRATE_ON_START` | Optional | `1` makes the Docker runner apply migrations before starting (`scripts/docker-entrypoint.sh`). For platforms without a release job, such as Render free; leave unset where the migrator image or Helm Job runs |
| `NODE_OPTIONS` | Optional | Set `--max-old-space-size=384` on a 512 MB instance (Render free) so the heap stays within memory |
| `AUTH_SECRET` | Required | Auth.js signing/encryption secret, at least 32 characters |
| `AUTH_URL` | Required | Canonical Auth.js HTTPS origin |
| `NEXT_PUBLIC_BASE_URL` | Required | Public link origin; must exactly match `AUTH_URL`. Sent emails also use it to make site-relative images and links (event cover, organisation logo, event page) absolute; without it those are left out of delivered broadcasts, while the dashboard preview still renders them |
| `AUTH_GOOGLE_ID` | Legacy fallback | Google OAuth client ID; configure new instances in Super admin → Settings |
| `AUTH_GOOGLE_SECRET` | Legacy fallback | Google OAuth client secret; configure new instances in Super admin → Settings |
| `SUPER_ADMIN_EMAIL` | Recommended | Sole email allowed into the instance administration area |

### Deployment example

Configure both canonical URL settings to the exact same HTTPS origin, for example a custom domain or, before you have one, the Render service URL:

```env
AUTH_URL=https://events.example.com
NEXT_PUBLIC_BASE_URL=https://events.example.com
# or, temporarily: https://spaceworks-events.onrender.com for both
```

If Google OAuth is enabled, register the matching callback with Google Cloud:

```text
https://events.example.com/api/auth/callback/google
```

Leave `ALLOWED_ACTION_ORIGINS` empty when browsers reach the application on this same hostname (including `*.onrender.com`). Configure it only if a trusted CDN or reverse proxy uses a different host for Server Action requests; no platform hostname is hard-coded. It is read when the image is **built**, so it needs your own build; the published release images refuse to start with it set (see [Releases and container images](CONTAINER_IMAGES.md)).

### Changing the public domain

When the application moves to a new hostname, update `AUTH_URL` and `NEXT_PUBLIC_BASE_URL`, update the Google OAuth callback/origin if used, then rebuild and deploy because `NEXT_PUBLIC_BASE_URL` is build-visible. Update DNS, TLS, the CDN/WAF, scheduler and uptime-monitor targets, and any reverse-proxy host allowlists at the same time.

Keep an HTTPS redirect from the old hostname to the new one for as long as invitation, ticket, certificate, and shared event links may be used. Auth cookies are host-specific, so existing users may need to sign in again after the change.

## Application secrets

| Variable | Production | Purpose |
| --- | --- | --- |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Required | Stable base64 AES key shared by the build and every replica; 16, 24, or 32 decoded bytes |
| `MFA_ENCRYPTION_KEY` | Required | Independent base64 key used to encrypt TOTP seeds; exactly 32 decoded bytes |
| `CRON_SECRET` | Required | Bearer secret for `POST /api/internal/outbox` (one full pass of timed jobs and email delivery, for cron services and recovery), at least 32 characters |
| `SWE_PROCESS_ROLE` | Optional | `all` (default): serve requests, send email (worker) and run timed jobs (beat) in one process. `web`, `worker` or `beat`: one part only, for installs that run them as separate containers. The image's `worker` and `beat` commands set it |
| `OUTBOX_POLL_MS` | Optional | How often the worker checks for queued email, in milliseconds (default 3000, 500 to 60000) |
| `HEALTHCHECK_SECRET` | Required | Bearer secret for database readiness, at least 32 characters |

Generate independent keys with `openssl rand -base64 32`. Rotating the Server Action key invalidates outstanding action forms. Rotating the MFA key without re-encrypting stored seeds prevents enrolled users from validating TOTP codes.

## Redis and request trust

| Variable | Production | Purpose |
| --- | --- | --- |
| `REDIS_URL` | Required | Distributed rate limiter and pub/sub for live ticket check-in across replicas; production requires `rediss://` |
| `TRUSTED_PROXY_IP_HEADER` | Required | One of `cf-connecting-ip`, `x-forwarded-for`, or `x-real-ip`; the edge must overwrite it. Render reached directly: `x-forwarded-for`; behind your own proxied Cloudflare zone: `cf-connecting-ip` |
| `TRUSTED_PROXY_HOPS` | Optional | With `x-forwarded-for` only: the number of trusted proxies that append to the header. Unset means the edge overwrites it and the left-most entry is used. Render: `1` (the right-most entry, added by Render's proxy) |
| `ALLOWED_ACTION_ORIGINS` | Optional | Comma-separated trusted proxy/CDN hosts allowed to invoke Server Actions |
| `ALLOWED_EMBED_ORIGINS` | Optional | Exact HTTPS origins permitted to frame public event embeds; blank disables cross-site framing |
| `NEXT_DEV_ALLOWED_ORIGINS` | Development only | Comma-separated LAN hosts permitted to request development assets |

Do not expose the application directly while trusting a client-controlled forwarding header.

Rate-limit windows are defined in code (`lib/rateLimit.ts`), not configured by environment. Recent buckets: `dataExport` (5 personal data exports per user per hour), `ticketStatus` (120 ticket status reads per IP per minute), `ticketEvents` (60 ticket event-stream connections per IP per minute), and `shortLink` (30 short-link lookups per IP per minute). The ticket buckets are generous because attendees at one venue often share a NAT address.

The live ticket stream at `/api/ticket/:token/events` is a long-lived `text/event-stream` response. Any reverse proxy in front of the application must not buffer it (for nginx, `proxy_buffering off`; the route also sends `X-Accel-Buffering: no`) and must allow idle reads of at least 30 seconds.

## Email and retention

| Variable | Production | Purpose |
| --- | --- | --- |
| `EMAIL_FROM` | Legacy fallback | Verified sender identity; configure new instances in Super admin → Settings |
| `SMTP_*` | Legacy fallback | SMTP settings; configure new instances in Super admin → Settings |
| `OUTBOX_RETENTION_DAYS` | Optional | Retention for non-capability sent/failed outbox history; defaults to 30 (capability-bearing rows are deleted immediately after delivery or terminal failure) |

Configure SMTP, Google SSO, and backup status under **Super admin → Settings**. SMTP and Google client secrets are encrypted at rest with a domain-separated key derived from `MFA_ENCRYPTION_KEY`, are never displayed after saving, and require the super-admin fresh-TOTP step-up. Environment values remain supported as migration fallbacks. Production SMTP connections require TLS with certificate verification: implicit TLS (`SMTP_SECURE=true`, usually port 465) or STARTTLS (`SMTP_SECURE=false`, port 587 or 2525). Render free web services block outbound ports 25, 465 and 587, so use Brevo on port 2525 there.

## Object storage

| Variable | Production | Purpose |
| --- | --- | --- |
| `S3_BUCKET` | Required | Private object-store bucket |
| `S3_REGION` | Required | Bucket region; `auto` for Cloudflare R2 |
| `S3_ENDPOINT` | Provider-dependent | Custom HTTPS endpoint for R2, Silo, or another compatible service |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Provider-dependent | Configure both, or neither when using a workload/IAM role |
| `S3_FORCE_PATH_STYLE` | Optional | Set to `1` for providers that require path-style addressing (`1` for Cloudflare R2 and Silo) |

The bucket must remain private. Existing database-backed assets can be moved with `npm run storage:migrate` after S3 is configured.

## Operational metadata

| Variable | Purpose |
| --- | --- |
| `BACKUP_*` | Legacy fallback | Backup status metadata; configure new instances in Super admin → Settings |

## Test-only bypass

`PAYMENTS_FAKE_PROVIDER_URL` points every Razorpay and Stripe API call at a local fake provider for tests (a loopback `http://127.0.0.1:<port>` origin only). It is refused when `NODE_ENV=production`: startup validation fails and provider calls throw. Organisations' payment keys are not environment variables; owners enter them in Settings → Payments, encrypted with a subkey of `MFA_ENCRYPTION_KEY`.

`ALLOW_INSECURE_PRODUCTION_TESTS=1` has an effect only when `CI=true`. Together they permit local HTTP, non-TLS test services, and the controlled in-memory Redis fallback while exercising a production build. Never configure this pair in a deployed environment.

Validate production configuration with:

```bash
npm run production:check
```


## Separate Netlify frontend and VPS backend

See [split deployment](DEPLOYMENT_SPLIT.md). Set `DEPLOYMENT_MODE=backend` and a
32-byte hex `FRONTEND_GATEWAY_SECRET` only when enabling the backend peer.
`AUTH_URL` and `NEXT_PUBLIC_BASE_URL` remain the same frontend HTTPS origin.
The frontend receives `BACKEND_ORIGIN`, `NEXT_PUBLIC_BACKEND_ORIGIN`,
`FRONTEND_GATEWAY_SECRET`, `FRONTEND_TRUSTED_IP_HEADER` and its own stable
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, plus `NEXT_PUBLIC_BASE_URL`. The gateway key
is server-only; never prefix it with `NEXT_PUBLIC_`. Use the Netlify-provided
`x-nf-client-connection-ip` header or a directly controlled reverse proxy that
always overwrites `x-real-ip`. Unknown addresses share the fail-closed fallback
bucket; forwarded browser-chosen headers are never authoritative.
