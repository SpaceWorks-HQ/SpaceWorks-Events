# Host the complete stack on a VPS

[Documentation index](README.md) · [Docker image details](DEPLOYMENT_DOCKER.md)

Run Space Works Events on one Linux VPS with Docker Engine and Docker Compose.
The production stack includes the Next.js application (UI and backend), PostgreSQL
16, Redis, private Silo S3-compatible storage, Caddy HTTPS, a separate one-shot
migration service and an independent email-outbox recovery scheduler. Node.js,
PostgreSQL and Redis do not need to be installed on the host.

This follows the service separation used by [SpaceWorks](https://github.com/SpaceWorks-HQ/SpaceWorks),
with the transport and privacy requirements of this Events application. Use
`compose.production.yml` through `scripts/vps-compose.sh`. The root
`docker-compose.yml` is for development and `compose.staging.yml` is for tests.

## Before you start

- A Linux VPS with Docker Engine, the Compose plugin and Git. Start with **2 vCPU,
  4 GB RAM and 30 GB SSD** for a small installation, with extra space for uploads
  and backups. These are starting estimates, not load-tested capacity limits;
  building the image can need additional memory or swap.
- A domain, such as `events.example.com`, whose DNS A record points to the VPS.
  Add an AAAA record only if IPv6 reaches this host too. Start with DNS-only
  records; the supplied proxy assumes clients connect directly to Caddy.
- Allow inbound TCP 80 and 443 (plus UDP 443 for HTTP/3) and restrict SSH to
  administrators. Only Caddy publishes application ports. Do not publish the
  app, database, Redis, storage API or storage console ports.
- An authenticated SMTP relay and a verified sending domain with SPF, DKIM and
  DMARC. Outgoing mail uses this relay; the stack does not operate a public mail
  server. Confirm that the VPS permits outbound SMTP on your relay's TLS port.
- Encrypted host disks and an encrypted, off-server backup destination. A single
  VPS is a single failure domain; Docker volumes alone are not backups or
  automatic point-in-time recovery.

## Guided installation

After installing Docker + Compose and Git, clone this repository, check out the
reviewed release, and run `bash scripts/setup-vps.sh` in an interactive terminal.
The script asks for the public hostname, super-admin email, external configuration
directory, sender and SMTP settings. It hides the SMTP password and shows a summary
before making changes. It generates configuration, builds the images, applies
migrations, waits for the stack and runs the VPS checks. It does not install
Docker, change DNS/firewall rules, configure off-server backups or silently update
an existing installation. Complete the account and real-delivery checks below.

For explicit commands or an automated deployment, follow the manual steps below.

## 1. Get a reviewed release and generate configuration

Clone the repository and check out the reviewed commit you intend to deploy.
Use a new version label for every release, including rebuilds with a changed
public hostname. Build images locally below, or use a trusted build host and
transfer the same versioned images to the VPS.

```bash
git clone https://github.com/SpaceWorks-HQ/SpaceWorks-Events.git
cd SpaceWorks-Events
git checkout <reviewed-commit-or-tag>
SWE_VERSION="vps-$(git rev-parse --short HEAD)"
export SWE_CONFIG_DIR=/etc/spaceworks-events
sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$SWE_CONFIG_DIR"

docker build --target ops --tag swevents-ops:bootstrap .
docker run --rm --user "$(id -u):$(id -g)" \
  --volume "$SWE_CONFIG_DIR:/config" \
  swevents-ops:bootstrap node docker/vps/setup.mjs \
  events.example.com admin@example.com "$SWE_VERSION"
```

Replace the hostname and admin email. Setup refuses an existing configuration;
**do not rerun it to upgrade**. It generates independent application secrets,
separate migration/runtime database passwords, separate storage root/application
credentials, a Redis password and a private CA with certificates for internal
services. It writes them to owner-only files outside Git without printing them.

Edit `$SWE_CONFIG_DIR/app.env` in a trusted editor. Set `EMAIL_FROM`, `SMTP_HOST`,
`SMTP_USER` and `SMTP_PASSWORD` to real values. Use `SMTP_PORT='587'` with
`SMTP_SECURE='false'` for STARTTLS, or port 465 with `SMTP_SECURE='true'` for
implicit TLS, according to your relay. Keep the generated secrets and connection
URLs. Single-quoted environment values preserve literal `$` characters; follow
[Compose's env-file syntax](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/#env-file-syntax)
if a provider credential contains quotes or special characters.

Keep an encrypted backup of this entire directory, especially
`MFA_ENCRYPTION_KEY`, the stable Server Actions key and the CA. Losing the MFA key
makes stored authenticator seeds and instance-managed credentials unreadable.
Do not copy these files into the checkout, publish images publicly, enable shell
tracing, or paste expanded Compose configuration into logs.

## 2. Build, check configuration and start

Run from the checked-out repository with `SWE_CONFIG_DIR` still exported:

```bash
scripts/vps-compose.sh config --quiet
scripts/vps-compose.sh build ops migrator app
scripts/vps-compose.sh run --rm --no-deps ops node docker/vps/check.mjs preflight
scripts/vps-compose.sh up -d
scripts/vps-compose.sh ps
```

BuildKit mounts the stable Server Actions key from `actions-key` during the app
build. The public HTTPS hostname is compiled into that image. Credentials for
PostgreSQL, Redis, storage and SMTP are runtime inputs, not build arguments.

Compose waits for PostgreSQL and Redis health, creates the private storage
bucket and application policy, and applies Prisma migrations before starting the
app. Migration failure blocks app startup. Caddy and the scheduler wait for app
health. Caddy obtains and renews the public TLS certificate; it needs working DNS
and reachable ports 80/443. This can take a short time on first startup.

The database rejects non-TLS TCP connections. Redis accepts TLS and password
authentication only. The app verifies internal certificates through the private
CA and uses a database role without superuser, role-management or database-creation
rights. Only the migrator receives the database administration credential; only
storage and its initializer receive the storage root credential. The CA signing
key is never mounted into a running service. Private images and encrypted host
storage remain operator responsibilities.

## 3. Verify and create the first account

```bash
scripts/vps-compose.sh run --rm --no-deps ops node docker/vps/check.mjs
scripts/vps-compose.sh run --rm --no-deps ops node scripts/prisma.mjs migrate status
curl --fail https://events.example.com/api/health
```

The VPS check verifies production settings, live database TLS, the runtime role,
the schema contract, authenticated Redis over TLS, access to the storage bucket
and bearer-protected `/api/health/db`. It never prints credentials or response
bodies. The storage initializer explicitly disables anonymous bucket access.

Open `https://events.example.com/login`, create an account with the configured
`SUPER_ADMIN_EMAIL`, verify its inbox, enable authenticator MFA, and enter
`/super-admin`. A fresh TOTP step-up is required there. Under **Settings**, verify
SMTP and optionally configure Google SSO. Do not use the demo seed on production.

Before taking registrations, verify a real confirmation email and password-reset
email, upload an event cover, register for a private test event, and check that a
ticket updates immediately when scanned. The proxy flushes streaming responses
for live check-in and overwrites `X-Real-IP`, which is the header this deployment
trusts. Review outbox heartbeat and failed delivery status in the operations area.
The separate scheduler calls the protected outbox endpoint every minute; it needs
no Cloudflare Worker or host cron.

## Upgrades and rollback

Back up first and record the current commit and image version. Review database
migrations for compatibility before changing the running installation.

1. Check out the new reviewed commit. Change only `SWE_VERSION` in the external
   `compose.env` to a new, immutable release label; retain all secrets and volumes.
2. Build the new images and run preflight as in step 2 above.
3. Apply migrations once, then verify the schema before replacing the app:

   ```bash
   scripts/vps-compose.sh run --rm migrator
   scripts/vps-compose.sh run --rm --no-deps ops node scripts/verify-production-schema.mjs
   scripts/vps-compose.sh up -d
   scripts/vps-compose.sh run --rm --no-deps ops node docker/vps/check.mjs
   ```

4. Verify public HTTPS, sign-in, email and live check-in. Keep previous images
   until the release is healthy. Do not run `docker image prune -a` during rollout.

To revert application code, restore the previous checkout and its version label,
then recreate the services from those retained images. Reverting images does
**not** undo migrations. A database rollback requires an explicit restore from a
verified backup and a compatible application version. Do not reset volumes to
repair an upgrade.

A hostname change needs matching `PUBLIC_HOST` in `compose.env`, matching
`AUTH_URL` / `NEXT_PUBLIC_BASE_URL` in `app.env`, a new image version and an app
rebuild. Also update DNS, OAuth callbacks, monitoring and any embeds; retain an
HTTPS redirect for previously shared links. Keep `actions-key` and its matching
runtime key stable across ordinary builds and upgrades.

## Backups and recovery

Persistent volumes hold PostgreSQL, Redis, object storage and Caddy certificates.
Back up **both database and uploaded objects**, plus the external configuration.
Use encrypted host disks, encrypted off-server archives, retention, backup-failure
alerts and regular restore drills. For the production recovery baseline, configure daily off-server backups and
PostgreSQL WAL archiving/PITR or provider-managed recovery separately, and test
restores before launch; this Compose file does not configure those services. Super-admin backup settings describe
posture and do not create backups.

For a small installation, a maintenance-window backup can stop writers, create a
logical database dump, stop the data services and take a consistent VPS/provider
snapshot of all Docker volumes and the external configuration, then restart.
The dump below writes into an owner-only directory outside Git:

```bash
umask 077
mkdir -p "$SWE_CONFIG_DIR/backups"
scripts/vps-compose.sh stop proxy scheduler app
scripts/vps-compose.sh exec -T postgres pg_dump -U swevents -d swevents -Fc \
  > "$SWE_CONFIG_DIR/backups/swevents-$(date -u +%Y%m%dT%H%M%SZ).dump"
# After checking that the dump succeeded:
scripts/vps-compose.sh stop postgres redis storage
# Take the encrypted volume/config snapshot using your backup provider now.
scripts/vps-compose.sh up -d
```

Check command exit codes before continuing. If backup fails, restart services
and resolve the failure; do not label the backup successful. Copy backups off
this VPS and verify restore on an isolated host, including images, encrypted
settings, registrations and sign-in. Restoring snapshots replaces live data:
stop all writers and follow a reviewed recovery procedure. Never run
`scripts/vps-compose.sh down --volumes` on an installation you want to retain.
See [Production operations](production-operations.md) for incident and retention
requirements and the existing operator-initiated archive tools.

## Certificate renewal and monitoring

Caddy renews public HTTPS certificates automatically while DNS and ports remain
reachable. Internal service certificates last **one year**. Schedule renewal
well before expiry with the ops image built from your deployed checkout:

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  --volume "$SWE_CONFIG_DIR:/config" \
  swevents-ops:bootstrap node docker/vps/setup.mjs renew-certificates
scripts/vps-compose.sh up -d --force-recreate postgres redis storage app proxy scheduler
scripts/vps-compose.sh run --rm --no-deps ops node docker/vps/check.mjs
```

Renewal retains the existing CA and all credentials; expect a short interruption
while services restart. The CA itself lasts ten years and needs a planned trust
rotation before expiry. Monitor disk space, certificate expiry, HTTPS, authenticated
readiness, Redis availability, database connections, outbox failures and fresh
backups. Container restart policies do not restart a process merely because its
healthcheck becomes unhealthy; alert and investigate.

## A separate frontend on Netlify

The related [SpaceWorks repository](https://github.com/SpaceWorks-HQ/SpaceWorks)
uses a separate Vite React SPA and a Django API. Its
[`netlify.toml`](https://github.com/SpaceWorks-HQ/SpaceWorks/blob/main/netlify.toml)
builds `frontend/` and points it at the backend with `VITE_API_URL`.

**Space Works Events currently has one Next.js application**, with Server
Components, Auth.js sessions, Server Actions and HTTP handlers together. There
is no standalone `frontend/`, static dashboard build or configurable remote
backend URL. Hosting only its existing UI on Netlify and only its backend on
this VPS is not an implemented deployment mode. Setting CORS or
`ALLOWED_ACTION_ORIGINS` does not separate those server features.

Supported arrangements today are:

| Arrangement | Where code runs |
| --- | --- |
| Complete VPS stack in this guide | UI rendering, auth, actions, API, database, Redis and files on the VPS; SMTP through your relay |
| VPS app with managed dependencies | Next.js in Docker; TLS database, Redis and private S3 elsewhere; see [Docker deployment](DEPLOYMENT_DOCKER.md) |
| Separate marketing site on Netlify | Your own static site on Netlify links to the Events app on the VPS, or embeds its public event page using the exact HTTPS `ALLOWED_EMBED_ORIGINS` allowlist |
| Frontend-only Netlify + Events backend on VPS | Requires a separate frontend and explicit browser-facing APIs/authentication; not supplied by this repository |

Deploying the entire Next.js application through a Netlify Next.js integration
would also move server rendering, auth and actions there. It is a separate
platform deployment that needs adapter, streaming, background-work and security
verification; this repository does not provide a tested Netlify deployment.
Keep database, Redis, storage and SMTP credentials server-side in every case.
