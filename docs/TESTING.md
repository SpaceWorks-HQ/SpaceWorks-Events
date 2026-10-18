# Testing and quality gates

[Documentation index](README.md)

## Test suites

### Unit tests

```bash
npm run test:unit
```

Fast Vitest tests cover validation and isolated domain/security behavior. Watch mode is available with `npm run test:unit:watch`.

Machine API coverage includes bearer parsing and hashing, credential state, strict DTOs, cursor validation, scope behavior, and forbidden-field regression checks.

Other security-relevant unit suites include `super-admin-page-guards` (fails if any `app/super-admin/**/page.tsx` omits `await requireSuperAdminMfa()`), the live-ticket suites (`ticket-check-in-events`, `ticket-check-in-publish`, `ticket-check-in-routes`, `ticket-check-in-watcher`, `use-ticket-check-in`), `account-data-export` and `account-organisations-actions`, `short-link-actions` and `short-link-resolve`, `broadcast-designs`, `event-publishing`, `safe-http-url`, and `image-validation`.

### PostgreSQL integration tests

```bash
docker compose up -d
TEST_DATABASE_URL="postgresql://swevents:swevents_dev@localhost:5432/swevents_test" npm run test:integration
```

These tests exercise real constraints, transactions, audit triggers, RSVP
capacity, and feedback persistence. `TEST_DATABASE_URL` is mandatory so the
suite cannot silently inherit the application's ambient `DATABASE_URL`. Keep
the named database disposable and never point it at production.

The machine API integration suite additionally exercises persisted credential hashes, cross-tenant event access, participant privacy, and bounded collections. The short-link suite covers owner/admin-only creation, cross-tenant rejection, idempotent and concurrent creation, regeneration, the unique index, and resolution for every non-published status.

### Coverage

```bash
npm run test:coverage
```

`vitest.coverage.config.mts` runs only service-independent unit tests while
measuring all `lib/**/*.ts` and `app/actions/**/*.ts` rather than a hand-selected
source subset. PostgreSQL tests must be run separately through
`npm run test:integration` with a disposable `TEST_DATABASE_URL`. The configured
minimum is a regression floor, not a statement that coverage is sufficient.

### Browser tests

Install Chromium once:

```bash
npx playwright install chromium
```

Then run either development or production mode:

```bash
npm run test:e2e
npm run build
npm run test:e2e:production
```

Production mode prepares and starts `.next/standalone/server.js`, including public and static assets. The suite checks liveness, Auth.js polling limits, mobile navigation, login/crawler controls, confirmed tickets, waitlisted ticket rejection, feedback, JPEG certificates, and short-link redirects and not-found behaviour.

## Static and dependency checks

```bash
npm run lint
npx tsc --noEmit
npm audit --audit-level=low
git diff --check
```

`npm audit` checks known advisories in the installed dependency graph. It does not detect application authorization bugs, unknown vulnerabilities, or infrastructure mistakes.

## Database and environment checks

```bash
npm run db:status
npm run db:verify
npm run production:check
```

- `db:status` confirms migration state.
- `db:verify` checks required columns, constraints, and audit triggers against the running database.
- `production:check` validates required production settings and transport requirements.

## Build and container verification

```bash
npm run build
docker build \
  --secret id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY --build-arg NEXT_PUBLIC_BASE_URL="$NEXT_PUBLIC_BASE_URL" \
  -t swevents:local .
```

The quality workflow runs dependency, migration, schema, lint, type, unit, integration, build, standalone-container smoke, and browser checks using PostgreSQL and Redis services. The container smoke test starts the runner with `MIGRATE_ON_START=1` and checks both `/api/health` and the bearer-protected `/api/health/db`.

Pooled-connection compatibility: Prisma's `pgbouncer=true` only disables prepared statements, so the integration suite can be pointed at a plain local database with a Supabase-style URL (`TEST_DATABASE_URL="postgresql://…/swevents_test?pgbouncer=true&connection_limit=1"`). The integration config sets `DIRECT_URL` to the same database. `tests/unit/check-production-env.test.ts` runs the preflight against a realistic Supabase/Upstash/R2/Brevo environment.

## Release test priorities

For every release, prioritize tests around:

1. Authentication, MFA, password reset, and session revocation.
2. Cross-organisation authorization and role transitions.
3. Event privacy, invitations, registration counts, discovery visibility (`listedPublicly`), and short-link resolution.
4. Capacity races, duplicate RSVP prevention, approval, waitlist, and cancellation.
5. Ticket eligibility, online/offline check-in, undo, and the live ticket tear (with and without Redis, and behind the production reverse proxy).
6. Anonymous feedback and certificate-enabled feedback.
7. Upload rejection, object storage, outbox delivery, and retention.

## Production VPS stack

For the full single-host deployment, follow [VPS deployment](DEPLOYMENT_VPS.md).
Use a disposable VPS or an isolated Compose project for deployment tests, with
fresh generated credentials. Do not reuse a production configuration directory.

```bash
scripts/vps-compose.sh config --quiet
scripts/vps-compose.sh run --rm --no-deps ops node docker/vps/check.mjs preflight
scripts/vps-compose.sh up -d --wait --wait-timeout 180
scripts/vps-compose.sh run --rm --no-deps ops node docker/vps/check.mjs
```

On a disposable stack only, the additional smoke test creates and rolls back
an audited organisation and checks an object upload/download/delete roundtrip,
anonymous storage rejection, plain-text database rejection and page rendering:

```bash
scripts/vps-compose.sh run --rm --no-deps ops node docker/vps/smoke.mjs
```

The final check verifies real database TLS and the runtime role, the schema,
authenticated Redis over TLS, bucket access and protected readiness. Also verify
anonymous storage rejection, plain-text database rejection, repeated migrations,
setup refusing existing credentials and internal-certificate renewal. Validate
Caddy configuration and complete public HTTPS, sign-in, mail, upload and streaming
checks on a reachable test domain before deploying to production.


## Separate frontend / VPS backend

Run `npm run test:e2e:split` with Docker and Node.js 22. It creates disposable
PostgreSQL/Redis containers, migrates, builds both workspaces, starts production
servers on loopback ports 3100/3200, and runs the browser suite plus split-specific
tenant/MFA/gateway checks. The frontend runs with an independent Server Actions
key and without backend data, authentication, mail or storage credentials.
It removes its own containers/volumes on completion; allow both ports to be free.
Plaintext dependency URLs and HTTP are limited to the existing explicit CI test
override. Production still requires TLS. It does not test a live Netlify adapter,
external SMTP/OAuth, S3 uploads or host package installation. The VPS guide covers
those live acceptance checks and the separate TLS/storage smoke checks.

Run `npm run test:e2e:vps` for the same disposable-dependency browser checks against
the original single-runtime production application. The split-only scenarios are
skipped in that mode.

The CI `hosting` matrix runs both deployment browser suites on Node.js 22 with
disposable containers; it needs no production hosting credentials.
