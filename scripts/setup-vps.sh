#!/usr/bin/env bash
# Guided first installation. The curl installer (install.sh) runs it as root
# from a staged source release; a reviewed checkout can run it directly with
# `sudo bash scripts/setup-vps.sh`. Every question comes first and nothing on
# the host changes until the summary is confirmed. Existing installations use
# scripts/update-vps.sh: setup never replaces generated secrets.
# --resume finishes a setup whose configuration was generated but whose build
# or start failed, without generating anything again.
# shellcheck disable=SC2154 # ask assigns answers by name
set -euo pipefail
set +x
source_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
# shellcheck source=scripts/vps-lib.sh
. "$source_dir/scripts/vps-lib.sh"
resume=0
case "${1:-}" in
  '') ;;
  --resume) resume=1 ;;
  *) die 'Usage: setup-vps.sh [--resume]' ;;
esac
require_root
[[ $(uname -s) = Linux ]] || die 'Run this on the Linux VPS.'
revision=$(release_revision "$source_dir")
version=$(release_version "$revision")
# Installer-managed when staged by install.sh or already inside $SWE_DIR/releases.
managed=0
case "$source_dir/" in "$SWE_DIR/releases/"*) managed=1 ;; esac
[[ ${SWE_STAGED:-0} != 1 ]] || managed=1
repository=${SWE_REPOSITORY:-$SWE_DEFAULT_REPOSITORY}
is_repository "$repository" || die 'SWE_REPOSITORY must be a GitHub owner/name.'

start_stack() {
  cd "$SWE_REPO_DIR"
  say 'Building images. This takes several minutes on a small server.'
  compose config --quiet
  compose build ops migrator app
  compose run --rm --no-deps ops node docker/vps/check.mjs preflight
  say 'Starting PostgreSQL, Redis, Silo storage, migrations, the app, Caddy and the scheduler.'
  compose up -d --wait --wait-timeout 300
  compose run --rm --no-deps ops node docker/vps/check.mjs
}

finish() {
  local origin public_host
  if [[ $managed = 1 ]]; then
    activate_release "$SWE_REPO_DIR"
    conf_set "$(install_conf)" SWE_RELEASE "$revision"
    conf_set "$(install_conf)" SWE_PENDING_RELEASE ''
  fi
  origin=$(conf_get "$SWE_CONFIG_DIR/compose.env" PUBLIC_ORIGIN)
  public_host=$(conf_get "$SWE_CONFIG_DIR/compose.env" PUBLIC_HOST)
  cat <<EOF

Space Works Events $version is running.
  Website:        $origin
  Health:         https://$public_host/api/health
  Configuration:  $SWE_CONFIG_DIR (contains every secret; keep an encrypted off-server copy)

Next steps
  1. Open $origin/login and sign up with the super-admin email, verify it,
     enable authenticator MFA, then open /super-admin.
  2. Send a test email, upload an event cover and register for a private test event.
  3. Back up: sudo bash $SWE_REPO_DIR/scripts/vps-backup.sh, then copy the backup off this server.
EOF
  if [[ -f "$SWE_CONFIG_DIR/frontend.env" ]]; then
    cat <<EOF
  4. Deploy the frontend from the same commit ($revision) on Netlify with the
     settings in $SWE_CONFIG_DIR/frontend.env. See docs/DEPLOYMENT_SPLIT.md.
EOF
  fi
  if [[ $managed = 1 ]]; then
    printf '\nRun the installer again at any time to update, back up or check this installation.\n'
  fi
}

load_config_dir
if [[ $resume = 1 && ! -f "$SWE_CONFIG_DIR/compose.env" ]]; then
  say 'No configuration was generated yet; starting the guided setup again.'
  resume=0
fi
if [[ $resume = 1 ]]; then
  [[ "$(conf_get "$SWE_CONFIG_DIR/compose.env" SWE_VERSION)" = "$version" ]] \
    || die 'This source release does not match the configured version; resume from the release setup started with.'
  [[ $managed = 0 ]] || take_lock
  SWE_REPO_DIR=$source_dir
  start_stack
  finish
  exit 0
fi

require_tty
case "$SWE_CONFIG_DIR/" in "$source_dir/"*|"$SWE_DIR/"*) die 'Keep production configuration outside the source and install directories.' ;; esac
[[ ! -e "$SWE_CONFIG_DIR/compose.env" ]] \
  || die "$SWE_CONFIG_DIR already holds a configuration. Use the update procedure; setup never replaces secrets."

# Checks only: nothing changes before the summary is confirmed.
case $(uname -m) in
  x86_64|amd64|aarch64|arm64) ;;
  *) die "Unsupported architecture $(uname -m); use an x86_64 or arm64 server." ;;
esac
for port in 80 443; do
  ! port_in_use "$port" || die "TCP port $port is already in use (another web server?). Free it, then rerun."
done
disk_mb=$(free_disk_mb /var/lib/docker)
(( disk_mb >= 10240 )) || die "At least 10 GB of free disk is needed for images, data and backups; only $disk_mb MB is free."
has_docker=0
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then has_docker=1; fi
offer_swap=0
memory=$(memory_mb)
if (( memory + $(swap_mb) < 3800 )) && [[ ! -e /swapfile ]]; then offer_swap=1; fi

cat >/dev/tty <<EOF

Space Works Events setup - release ${revision:0:12} from $repository
Answer the questions below. Press Enter to accept a [default].
Nothing on this server changes until you confirm the summary.

EOF
ask hosting_mode 'Hosting: 1 = everything on this VPS, 2 = Netlify frontend + this VPS as the backend' 1 is_mode 'Enter 1 or 2.'
frontend_host=''
if [[ $hosting_mode = 1 ]]; then
  ask public_host 'Public hostname (its DNS A record points at this server)' '' is_hostname 'Enter a hostname such as events.example.com.'
  public_host=${public_host,,}
  site_host=$public_host
else
  ask public_host 'Backend hostname for this VPS (DNS A record points here)' '' is_hostname 'Enter a hostname such as api.events.example.com.'
  public_host=${public_host,,}
  is_frontend_host() { is_hostname "$1" && [[ "${1,,}" != "$public_host" ]]; }
  ask frontend_host 'Frontend hostname on Netlify' '' is_frontend_host 'Enter a different hostname, such as events.example.com or your-site.netlify.app.'
  frontend_host=${frontend_host,,}
  site_host=$frontend_host
fi
ask admin_email 'Super-admin email (sign up with it to administer this instance)' '' is_email 'Enter an email address.'
printf '\nOutgoing email needs an authenticated SMTP relay on a verified sending domain (Brevo, Amazon SES, Postmark...).\n' >/dev/tty
ask EMAIL_FROM 'Sender, as Name <address@your-verified-domain>' "Space Works Events <events@$site_host>" is_nonempty
ask SMTP_HOST 'SMTP host' 'smtp-relay.brevo.com' is_hostname 'Enter the relay hostname, such as smtp-relay.brevo.com.'
default_port=587
[[ "${SMTP_HOST,,}" != *brevo.com ]] || default_port=2525
ask SMTP_PORT 'SMTP port (Brevo: 2525 or 587; implicit TLS: 465)' "$default_port" is_port 'Enter a port number between 1 and 65535.'
SMTP_SECURE=false
if [[ $SMTP_PORT = 465 ]]; then SMTP_SECURE=true; fi
ask SMTP_USER 'SMTP login' '' is_nonempty
ask_secret SMTP_PASSWORD 'SMTP password or key (hidden)'
make_swap=0
if [[ $offer_swap = 1 ]] && confirm "This server has $memory MB of memory; building the app needs about 4 GB. Create a 4 GB swap file at /swapfile?" Y; then
  make_swap=1
fi
dns=$(getent ahosts "$public_host" 2>/dev/null | awk '{ print $1 }' | sort -u | tr '\n' ' ' || true)

install_path=$source_dir
[[ $managed = 0 ]] || install_path="$SWE_DIR/releases/$revision"
{
  printf '\nSummary\n'
  printf '  Release:         %s (%s)\n' "$revision" "$repository"
  printf '  Installed to:    %s\n' "$install_path"
  printf '  Configuration:   %s (secrets, owner-only)\n' "$SWE_CONFIG_DIR"
  printf '  Website:         https://%s\n' "$site_host"
  [[ -z "$frontend_host" ]] || printf '  Backend (VPS):   https://%s (deploy the frontend to Netlify afterwards)\n' "$public_host"
  printf '  Super admin:     %s\n' "$admin_email"
  printf '  Email:           %s via %s:%s (implicit TLS: %s)\n' "$EMAIL_FROM" "$SMTP_HOST" "$SMTP_PORT" "$SMTP_SECURE"
  printf '  Services:        app, PostgreSQL 16, Redis 7, Silo object storage, Caddy HTTPS on ports 80/443,\n'
  printf '                   one-shot migrations and an email-outbox scheduler (Docker Compose project swevents)\n'
  printf '  DNS:             %s\n' "${dns:-$public_host does not resolve yet; HTTPS starts working once it points here}"
  printf 'Host changes\n'
  [[ $make_swap = 0 ]] || printf '  - create and enable a 4 GB swap file at /swapfile\n'
  [[ $has_docker = 1 ]] || printf '  - install Docker Engine and Docker Compose from the official repositories\n'
  printf '  - generate secrets and private TLS certificates in %s\n' "$SWE_CONFIG_DIR"
  printf '  - build images, create volumes, apply database migrations and start the services\n\n'
} >/dev/tty
confirm 'Proceed?' Y || { say 'Cancelled. Nothing was changed.'; exit 2; }

[[ $make_swap = 0 ]] || create_swap 4096
[[ $has_docker = 1 ]] || bash "$source_dir/scripts/install-docker.sh"
if ! docker info >/dev/null 2>&1; then
  systemctl enable --now docker >/dev/null 2>&1 || true
  docker info >/dev/null 2>&1 || die 'Docker is installed but not running. Start it (systemctl start docker) and resume.'
fi
SWE_REPO_DIR=$source_dir
if [[ $managed = 1 ]]; then
  take_lock
  SWE_REPO_DIR=$(promote_release "$source_dir" "$revision")
  conf_set "$(install_conf)" SWE_CONFIG_DIR "$SWE_CONFIG_DIR"
  conf_set "$(install_conf)" SWE_REPOSITORY "$repository"
  conf_set "$(install_conf)" SWE_PENDING_RELEASE "$revision"
fi
cd "$SWE_REPO_DIR"
install -d -m 0700 "$SWE_CONFIG_DIR"
say 'Generating secrets and internal certificates.'
docker build --quiet --target ops --tag "swevents-ops:$version" . >/dev/null
docker run --rm --volume "$SWE_CONFIG_DIR:/config" "swevents-ops:$version" \
  node docker/vps/setup.mjs "$public_host" "$admin_email" "$version" "$frontend_host"
export EMAIL_FROM SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASSWORD
docker run --rm --volume "$SWE_CONFIG_DIR:/config" \
  --env EMAIL_FROM --env SMTP_HOST --env SMTP_PORT --env SMTP_SECURE --env SMTP_USER --env SMTP_PASSWORD \
  "swevents-ops:$version" node docker/vps/configure-smtp.mjs
unset SMTP_PASSWORD SMTP_USER
start_stack
finish
