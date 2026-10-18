# Architecture

[Documentation index](README.md)

## Stack

- Next.js 16 App Router and React 19
- TypeScript
- PostgreSQL and Prisma ORM
- Auth.js with Prisma persistence
- Tailwind CSS, Radix UI primitives and lucide icons (`components/ui/*`)
- Redis for distributed rate limiting and realtime ticket check-in pub/sub
- S3-compatible private object storage
- Nodemailer-backed transactional email
- Vitest and Playwright

## Repository layout

| Path | Responsibility |
| --- | --- |
| `app/` | Pages, layouts, Server Actions, and route handlers |
| `components/` | Client and server UI components grouped by product area |
| `lib/` | Authentication, authorization, validation, RSVP logic, storage, email, rate limiting, and shared services |
| `prisma/` | Data model and ordered production migrations |
| `scripts/` | Environment, schema, asset migration, and standalone-build helpers |
| `tests/` | Unit, PostgreSQL integration, and browser suites |
| `docs/` | Product and operational documentation |

## Request flow

```text
Browser / API client
        |
        v
Next.js proxy: rate limits + CSP nonce
        |
        +--> React Server Component / Server Action
        |          |
        |          +--> Auth.js session + permission checks
        |          +--> Zod validation
        |          +--> Prisma transaction
        |
        +--> Route handler
                   |
                   +--> monitoring + rate limit + validation
                   +--> domain service + Prisma
```

Server Actions are used for authenticated dashboard mutations. Public RSVP and feedback submissions use JSON route handlers. Authorization belongs on the server even when the UI hides an unavailable control.

External applications authenticate under `/api/v1` with tenant-bound `ApiClient` credentials rather than Auth.js sessions. A route wrapper resolves the client organisation and scopes, then passes that context to explicit domain readers. Queries include the organisation predicate and responses are mapped through validated API DTOs rather than serialized Prisma models.

## Multi-tenancy and authorization

`Organisation` is the tenant boundary. Events, series, invitations, assets, and audit events resolve through an organisation. `Membership` connects a user to a tenant with an owner, admin, or member role. Permission helpers and action-specific checks enforce access before mutation.

The super-admin boundary is separate: access requires an authenticated email matching `SUPER_ADMIN_EMAIL`, and unauthorized requests behave as not found.

## Main data areas

- Identity: `User`, `Account`, `Session`, and `VerificationToken`.
- Tenancy: `Organisation`, `Membership`, and `OrganisationInvite`.
- Events: `Event` (including `listedPublicly` for listed approval-required events and an optional unique `shortCode`), `EventInvite`, `EventSeries`, `SeriesInvite`, and `EventInstance`.
- Registration: `RSVP`, registration forms, fields (with help text, placeholder, and validated `settings` JSON), and typed answers.
- Communications: `EventBroadcast` records each organiser email, including its chosen `design`; each recipient is a separate `OutboxMessage`.
- Feedback: feedback forms, fields, responses, typed answers, and optional certificate linkage.
- Operations: `OutboxMessage`, `OperationalHeartbeat`, `AuditEvent`, `CheckInEvent`, `RsvpDeletionUndo`, and `Asset`.
- Instance administration: the singleton `InstanceSetting` holds the new-account policy plus encrypted SMTP and Google SSO secrets and non-secret backup posture. It is readable and mutable only through the super-admin boundary.
- Machine access: `ApiClient`, `ApiClientScope`, and hashed, rotatable `ApiCredential` records.

Refer to `prisma/schema.prisma` for the authoritative fields, constraints, indexes, and cascading behavior.

## Background and scheduled work

Request handlers enqueue transactional messages in `OutboxMessage`; they do not wait for SMTP delivery. Every self-hosted Node.js instance starts a singleton one-minute worker that claims and sends a batch, retries failures, purges expired operational records, and updates a one-row `OperationalHeartbeat`. Queue row claims keep concurrent replicas safe. The protected `POST /api/internal/outbox` endpoint remains available as an external scheduler or recovery trigger.

## Realtime ticket check-in

When an RSVP transitions to checked in, `commitCheckInProjection` (`lib/checkInMutations.ts`, the single write path for online scans, manual check-in, offline-sync replay, and venue stations) publishes a `checkedInAt` message after its transaction commits through `lib/ticketCheckInEvents.ts`. Channels are keyed by RSVP id, never by the ticket token. With `REDIS_URL` set, messages fan out to every replica over Redis pub/sub (one lazily created subscriber connection per process, reference-counted per channel); without Redis an in-process EventEmitter shared through `globalThis` is used (Next.js can load the module more than once per process, for example in separate Server Action and route-handler bundles), which only reaches viewers on the same instance. Production requires `REDIS_URL`, so multi-replica deployments always use pub/sub. Publishing is fire-and-forget and never fails a check-in. The ticket page listens via `GET /api/ticket/:token/events` (SSE) and can fall back to `GET /api/ticket/:token/status`; both return only the check-in state. Delivery is best effort: while the stream is open the client also re-reads the status every 15 seconds, and a dropped message is recovered on that check, the next reconnect, or a return to the tab. Status and stream requests are rate limited per client IP (`ticketStatus`, `ticketEvents`), and each process caps open ticket streams. Reverse proxies must not buffer `text/event-stream` responses: the route sends `X-Accel-Buffering: no`, and nginx-style proxies should also set `proxy_buffering off` for `/api/ticket/`. Allow idle reads of at least 30 seconds (the stream sends a ping every 25 seconds and closes after 10 minutes).

## Instance service configuration

Super-admins with a current TOTP step-up can configure SMTP, Google SSO, and backup posture at `/super-admin/settings`. Instance-managed values take precedence over legacy environment fallbacks. SMTP and Google client secrets are encrypted at rest with an AES-GCM key domain-separated from `MFA_ENCRYPTION_KEY`; the application never renders stored secrets back to the browser. Backup posture is display-only—backup execution, encryption, retention enforcement, and restore access remain infrastructure responsibilities.

## Storage

Asset metadata lives in PostgreSQL. Production file bytes live in a private S3-compatible bucket and are served through the application-controlled upload route. Local development can retain database blobs as a fallback. Production startup requires S3 configuration.

## Security headers and rendering

The proxy generates a fresh Content Security Policy nonce for application-page requests. The root layout waits for a real request so Next.js can attach the nonce to framework scripts. Other response headers include HSTS in production, frame denial, content-type protection, a restricted permissions policy, and a strict referrer policy.

This per-request nonce makes application pages dynamically rendered. There is deliberately no root `app/loading.tsx`: a root Suspense boundary would stream a 200 before `notFound()` or `redirect()` run, breaking real 404s and the short-link 307. Loading screens live at `app/dashboard/loading.tsx` and the dashboard organisation and event segments. Static metadata endpoints such as `robots.txt` and `sitemap.xml` remain static.

## Deployment shape

`next.config.ts` produces standalone output. The Docker image copies the standalone server, public assets, static chunks, and Prisma migrations into a non-root runtime image. PostgreSQL, Redis, S3, SMTP, TLS termination, scheduling, monitoring, and backup services are external production dependencies.
