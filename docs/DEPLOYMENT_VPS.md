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

- A 64-bit (x86_64 or arm64) Linux VPS: Ubuntu/Debian, Fedora/RHEL/Alma/Rocky,
  Arch or openSUSE. The installer installs Docker Engine + Compose when missing.
  Start with **2 vCPU, 4 GB RAM and 30 GB SSD** for a small installation, with
  extra space for uploads and backups. These are starting estimates, not
  load-tested capacity limits. Building the image needs about 4 GB of memory; the
  installer offers a swap file on smaller servers.
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

As root or a user with `sudo`:

```bash
curl -fsSL https://raw.githubusercontent.com/SpaceWorks-HQ/SpaceWorks-Events/main/install.sh | bash
```

The bootstrap checks for Linux, the architecture, root or sudo and `curl`/`tar`,
resolves `main` (or `--ref`) to one commit and downloads that archive into
temporary storage. The release's `scripts/setup-vps.sh` then checks disk space and
ports 80/443 and asks every question first: mode 1 (everything on the VPS) or
mode 2 ([Netlify + VPS](DEPLOYMENT_SPLIT.md)), hostnames, super-admin email,
verified sender and SMTP relay (password hidden; Brevo is prefilled on port 2525).
Invalid answers are asked again. On a server with less than 4 GB of memory it
offers a 4 GB swap file. It reports what the hostname resolves to and shows one
summary of every answer and host change. **Nothing changes before you confirm.**

After confirmation it creates the swap file if accepted, installs Docker from the
distribution family's official source if missing, copies the release to
`/opt/spaceworks-events/releases/<commit>`, generates configuration in
`/etc/spaceworks-events`, builds the images, applies migrations, waits for healthy
services and runs the VPS checks. `current` then points at the release and
`/opt/spaceworks-events/install.conf` records the configuration directory and the
repository to update from. `--dir` changes the installation directory, `--ref`
installs a branch, tag or commit, and `--repo owner/name` a fork; pass options as
`curl … | bash -s -- --dir /srv/spaceworks-events`. To keep secrets somewhere
other than `/etc/spaceworks-events`, set the variable on the `bash` side of the
pipe: `curl … | SWE_CONFIG_DIR=/srv/events-config bash`. Running `curl … | sudo bash`
as root works too. DNS, firewall policy, SMTP provisioning and off-server backups
remain operator tasks.

Answers are stored in single-quoted env files, so the sender, SMTP login and
password cannot contain `'` or `\`; the installer asks again if they do.

If setup stops after confirmation (a failed build, a full disk), fix the cause and
run the one-liner again: it offers to **resume** that release without generating
new secrets. Only one install, update, backup or restore runs at a time.

From a reviewed checkout, `sudo bash scripts/setup-vps.sh` asks the same questions
and runs the stack from that checkout instead of `/opt/spaceworks-events`. For
explicit commands or automation, follow the manual steps below.

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

Run the one-liner again and choose **1) Update to the latest release** (or pass
`--update` to skip the menu). The menu also offers **2) Back up now** and
**3) Check status and health**. The updater:

1. stops if the installation already runs the latest commit;
2. shows the current and new release and asks for confirmation;
3. backs up the database and configuration (`scripts/vps-backup.sh --no-objects`);
4. changes only `SWE_VERSION` in `compose.env`, builds the new images while the site
   keeps running, runs preflight, applies migrations and verifies the schema;
5. recreates the services, waits for them to be healthy and runs the VPS checks;
6. points `current` at the new release and keeps the three newest releases and
   their images.

If any step after the backup fails, it restores the previous `compose.env` and
starts the previous release's retained images. **Migrations that already ran are
not reversed**; review migrations before updating, and restore the pre-update
backup if an older release cannot run on the newer schema. For automation, unpack
the new release with its commit in a `.release` file and run
`sudo bash <new release>/scripts/update-vps.sh --yes`; it is copied into
`releases/` like any other update. For split hosting, deploy
the identical commit to Netlify after the backend update.

For a checkout-based installation, follow the manual steps below.

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

A hostname change needs matching `PUBLIC_HOST` and `PUBLIC_ORIGIN` in `compose.env`, matching
`AUTH_URL` / `NEXT_PUBLIC_BASE_URL` in `app.env`, a new image version and an app
rebuild. Also update DNS, OAuth callbacks, monitoring and any embeds; retain an
HTTPS redirect for previously shared links. Keep `actions-key` and its matching
runtime key stable across ordinary builds and upgrades.

## Backups and recovery

Persistent volumes hold PostgreSQL, Redis, Silo object storage and Caddy
certificates. Back up **both database and uploaded objects**, plus the external
configuration:

```bash
sudo bash /opt/spaceworks-events/current/scripts/vps-backup.sh
```

The services keep running. The script writes `/etc/spaceworks-events/backups/<UTC time>/`
with a consistent `database.dump` (checked with `pg_restore --list`), `config.tar.gz`
(every secret, including `MFA_ENCRYPTION_KEY` and the CA) and `objects/` (every
uploaded file, mirrored from Silo). `--no-objects` skips the files; updates and
restores use it. It keeps the newest seven full and seven database-only backups
(`SWE_BACKUP_KEEP` changes that), and never removes the backup being restored.
Schedule it, for example with a root cron entry
`30 3 * * * bash /opt/spaceworks-events/current/scripts/vps-backup.sh`, and copy each
backup off this server, encrypted, the same day. A backup on the same VPS is not a
backup of the VPS.

To restore on the same installation:

```bash
sudo bash /opt/spaceworks-events/current/scripts/vps-restore.sh /etc/spaceworks-events/backups/<time>
```

It shows what will be replaced and asks you to type `RESTORE`. It backs up the
current database first, stops the app, Caddy and the scheduler, and replaces the
database in one transaction. It then copies the backup's files back into Silo
(newer files stay), runs migrations if the backup came from an older release,
starts everything and runs the VPS checks.

On a **new server**, restore the configuration before anything else, because the
database holds data encrypted with its keys. Do not run a fresh install: it would
generate different keys. Copy the backup directory to the server (here
`/root/<time>`). Then, as root, unpack the release named in its `version` file and
record it as an unfinished installation:

```bash
backup=/root/<time>
commit=$(curl -fsSL -H 'Accept: application/vnd.github.sha' \
  "https://api.github.com/repos/SpaceWorks-HQ/SpaceWorks-Events/commits/$(sed 's/^vps-//' "$backup/version")")
release=/opt/spaceworks-events/releases/$commit
mkdir -p "$release"
curl -fsSL "https://codeload.github.com/SpaceWorks-HQ/SpaceWorks-Events/tar.gz/$commit" | tar -xz -C "$release" --strip-components=1
echo "$commit" > "$release/.release"
install -d -m 0700 /etc/spaceworks-events
tar -xzf "$backup/config.tar.gz" -C /etc/spaceworks-events
printf "SWE_CONFIG_DIR='/etc/spaceworks-events'\nSWE_PENDING_RELEASE='%s'\n" "$commit" > /opt/spaceworks-events/install.conf
command -v docker >/dev/null || bash "$release/scripts/install-docker.sh"
```

Run the one-liner and choose **Resume**. It builds and starts that release with
the restored keys. Then run `vps-restore.sh "$backup"` and point DNS at the new
server. Later updates work as usual.

For the production recovery baseline, also configure encrypted off-server
retention, backup-failure alerts, PostgreSQL WAL archiving/PITR or
provider-managed recovery, and regular restore drills on an isolated host; this
Compose file does not configure those. Super-admin backup settings describe
posture and do not create backups. Never run `scripts/vps-compose.sh down --volumes`
on an installation you want to retain. See [Production operations](production-operations.md)
for incident and retention requirements.

## Certificate renewal and monitoring

Caddy renews public HTTPS certificates automatically while DNS and ports remain
reachable. Internal service certificates last **one year**. Schedule renewal
well before expiry with the ops image of the running release. As root:

```bash
cd /opt/spaceworks-events/current   # or your checkout
export SWE_CONFIG_DIR=/etc/spaceworks-events
(. "$SWE_CONFIG_DIR/compose.env"; docker run --rm --volume "$SWE_CONFIG_DIR:/config" \
  "swevents-ops:$SWE_VERSION" node docker/vps/setup.mjs renew-certificates)
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

Choose mode 2 in the installer and follow [Netlify frontend + Docker VPS backend](DEPLOYMENT_SPLIT.md).
The same data services, private TLS, migrations, scheduler, backups and renewal
procedures apply. `PUBLIC_HOST` is the VPS API hostname; `PUBLIC_ORIGIN`, `AUTH_URL`
and `NEXT_PUBLIC_BASE_URL` are the frontend HTTPS origin. Public variables require
rebuilding the appropriate application image/workspace when changed.
