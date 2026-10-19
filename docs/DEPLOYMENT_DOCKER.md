# Production Docker deployment

[Documentation index](README.md)

This guide describes the Docker deployment that the repository supports today.
It is intended for a single host or another container platform that does not use
Kubernetes. For Kubernetes, use the [Helm chart](../charts/spaceworks-events/README.md).
For the default free-tier setup (Render, Supabase, Upstash, Cloudflare R2,
Brevo), follow [Free-tier cloud deployment](DEPLOYMENT_CLOUD.md) instead.

For the complete single-VPS stack, use **[Host the complete stack on a VPS](DEPLOYMENT_VPS.md)**
and `compose.production.yml`. It includes PostgreSQL, Redis, private storage,
HTTPS, migrations and scheduling. This page covers the alternative: an application
container with separately supplied production services. The root
`docker-compose.yml` remains development-only; `compose.staging.yml` deliberately
enables insecure test exceptions. Neither is a production setup.

## Production topology

Run the Space Works Events application container behind a TLS-terminating reverse proxy or
load balancer. Supply these production services separately:

- PostgreSQL with TLS, encryption at rest, point-in-time recovery, and tested
  backups;
- Redis over TLS (`rediss://`);
- private S3-compatible object storage, using an HTTPS endpoint when one is
  configured;
- authenticated transactional SMTP; and
- a CDN/WAF or reverse proxy that overwrites the configured trusted client-IP
  header.

The live ticket page holds a Server-Sent Events stream at
`/api/ticket/:token/events`. Configure the reverse proxy not to buffer
`text/event-stream` responses (nginx: `proxy_buffering off` for
`/api/ticket/`; the route also sends `X-Accel-Buffering: no`) and to allow idle
reads of at least 30 seconds. Redis pub/sub carries check-in notifications
between application replicas.

The application image contains only the application. It does not run
PostgreSQL, Redis, object storage, TLS termination, or SMTP. Keep the container
port private and expose it only through the trusted proxy.

## Build immutable images

Every green build of `main` publishes public images to GitHub Packages that
work for any installation (see [Releases and container images](CONTAINER_IMAGES.md)):
pull `ghcr.io/spaceworks-hq/spaceworks-events:<version>` and
`ghcr.io/spaceworks-hq/spaceworks-events-migrator:<version>` and skip this
section. The commands below build your own images instead.

Build the application and migration targets from the same reviewed commit and
give both the same immutable release version:

```bash
export SWE_VERSION=1.0.0

docker build \
  --target migrator \
  --tag ghcr.io/spaceworks-hq/spaceworks-events-migrator:${SWE_VERSION} \
  .

docker build \
  --target runner \
  --secret id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY --build-arg NEXT_PUBLIC_BASE_URL="$NEXT_PUBLIC_BASE_URL" \
  --tag ghcr.io/spaceworks-hq/spaceworks-events:${SWE_VERSION} \
  .
```

Export `NEXT_PUBLIC_BASE_URL` with the production HTTPS origin before building.
It is compiled into the image and must match the runtime canonical URL.

The Server Actions key is passed through a BuildKit secret mount and is required
only by the application build. (Builders without BuildKit secrets, such as
Render, may pass it as a `--build-arg` of the same name instead; the value
then stays in the builder stage's metadata and cache but never reaches the
runner image.) Supply the
same stable value to the running application. Build it in trusted CI without
printing it, and do not publish or reuse the key between independent Space Works Events
instances. Rotating it invalidates outstanding Server Action forms.

Push immutable version tags to a private registry. Do not deploy a mutable
`latest` tag.

## Configure the runtime

Create a production environment file outside the repository, restrict it to its
owner, and populate the variables documented in
[Configuration](CONFIGURATION.md). A deployment-platform secrets manager is
preferred; an owner-only environment file is the minimum single-host option.

```bash
umask 077
touch /secure/path/swevents.env
```

At minimum, verify that:

- `AUTH_URL` and `NEXT_PUBLIC_BASE_URL` are the same public HTTPS origin;
- `DATABASE_URL` (and `DIRECT_URL`, when set) requires TLS;
- `REDIS_URL` starts with `rediss://`;
- a custom `S3_ENDPOINT`, when used, starts with `https://`;
- the S3 bucket is private;
- `EMAIL_FROM` and an authenticated `SMTP_SERVICE` or `SMTP_HOST` fallback are
  configured for bootstrap and disaster recovery;
- `TRUSTED_PROXY_IP_HEADER` names a header overwritten by the edge; and
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is this installation's stable key (for
  your own build, the value it was built with; published images take it at
  runtime).

Run the preflight from a trusted release checkout before deploying:

```bash
node --env-file=/secure/path/swevents.env scripts/check-production-env.mjs
```

Do not expose the contents of the environment file in logs, shell tracing, or a
deployment record.

## First installation

For a new empty database, run the one-shot migration image before starting the
application:

```bash
docker pull ghcr.io/spaceworks-hq/spaceworks-events-migrator:${SWE_VERSION}
docker pull ghcr.io/spaceworks-hq/spaceworks-events:${SWE_VERSION}

docker run --rm \
  --env-file /secure/path/swevents.env \
  ghcr.io/spaceworks-hq/spaceworks-events-migrator:${SWE_VERSION}

node --env-file=/secure/path/swevents.env scripts/verify-production-schema.mjs
```

Start the application on a loopback-only port when the reverse proxy runs on
the host:

```bash
docker run -d \
  --name swevents \
  --restart unless-stopped \
  --env-file /secure/path/swevents.env \
  --publish 127.0.0.1:3000:3000 \
  ghcr.io/spaceworks-hq/spaceworks-events:${SWE_VERSION}
```

If the proxy is another container, use a private Docker network instead of a
published host port. Do not publish PostgreSQL, Redis, or object-storage
administration ports to the internet.

Verify liveness locally and through the public HTTPS origin:

```bash
curl --fail http://127.0.0.1:3000/api/health
curl --fail https://events.example.com/api/health
```

Also call `GET /api/health/db` from the monitoring system with the
`Authorization` header set to `Bearer $HEALTHCHECK_SECRET`. Do not place that
bearer value in a URL.

After the first sign-in, enroll authenticator MFA for the super-admin account,
then verify or replace the bootstrap SMTP fallback and configure optional
Google SSO under `/super-admin/settings`. Test email delivery before accepting
registrations. Keep the environment SMTP credentials in the deployment secret
store as a disaster-recovery fallback.

## Upgrade an existing installation

Use this order for every release:

1. Complete the [production release checklist](PRODUCTION_RELEASE.md).
2. Take and verify a database backup and record the current application image.
3. Pull the new application and migrator images.
4. Run the new migrator image once. A failed migration blocks the rollout.
5. Replace the application container with the new immutable image.
6. Verify liveness, authenticated database readiness, outbox heartbeat, email
   delivery, Redis health, and error rate before completing the deployment.

Example container replacement after a successful migration:

```bash
docker stop swevents
docker rename swevents swevents-previous

docker run -d \
  --name swevents \
  --restart unless-stopped \
  --env-file /secure/path/swevents.env \
  --publish 127.0.0.1:3000:3000 \
  ghcr.io/spaceworks-hq/spaceworks-events:${SWE_VERSION}
```

Remove `swevents-previous` only after the new release is healthy. Reverting the
application image does not reverse a database migration; migrations must be
reviewed for backward compatibility and restored from a verified backup when a
database rollback is genuinely required.

## Outbox scheduling and readiness

Each application process runs the outbox worker once per minute. In production,
also configure an independent scheduler to call `POST /api/internal/outbox`
with `Authorization: Bearer $CRON_SECRET` as a recovery path. Monitor the
worker heartbeat and failed queue items.

Use `/api/health` for dependency-free liveness. Use the bearer-protected
`/api/health/db` endpoint for readiness. Never expose either bearer secret in
monitoring URLs or logs.

## Migrating on start (platforms without a release job)

The `runner` image bundles a pinned Prisma CLI and the migrations. With
`MIGRATE_ON_START=1`, its entrypoint (`scripts/docker-entrypoint.sh`) runs
`prisma migrate deploy` before starting the server and exits non-zero if a
migration fails. Use this only where no separate release step exists (the
Render free plan); with several replicas, keep the separate migrator step so
one release applies migrations exactly once.

Migrations connect through `DIRECT_URL` and fall back to `DATABASE_URL`. Set
`DIRECT_URL` to a direct or session-mode connection whenever `DATABASE_URL`
goes through a transaction pooler (for example Supabase on port 6543 with
`pgbouncer=true`). This applies to the migrator image as well.

## Current image-packaging limitations

The separate `ops` target packages setup, preflight, schema and archive tools
for the [VPS deployment](DEPLOYMENT_VPS.md); it is not an application server.
The `runner` image does not contain operational scripts. The `migrator` image
contains Prisma migrations but not the storage migration, backup, or restore
scripts. Consequently:

- run `npm run storage:migrate` from a trusted checkout when legacy
  database-backed assets still exist; and
- run `npm run db:backup` and `npm run db:restore` from a trusted operational
  host with compatible PostgreSQL client tools.

Follow [Production operations](production-operations.md) for backup storage,
restore acknowledgement, retention, monitoring, and incident requirements.
The [one-line VPS installer](DEPLOYMENT_VPS.md#guided-installation) runs the
latest GitHub Release with its published images, or builds these targets on the
server from a branch or commit (`--ref`); `sudo bash scripts/setup-vps.sh`
builds from a reviewed checkout.
