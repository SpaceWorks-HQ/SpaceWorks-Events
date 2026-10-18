#!/usr/bin/env bash
# Guided first installation only. Existing installs use the update procedure.
set -euo pipefail
set +x
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_dir"
for dependency in docker git; do
  command -v "$dependency" >/dev/null || { echo "Install $dependency first; see docs/DEPLOYMENT_VPS.md." >&2; exit 1; }
done
docker info >/dev/null
docker compose version >/dev/null
[[ -t 0 ]] || { echo 'Run this installer in an interactive terminal.' >&2; exit 1; }
read -r -p 'Public hostname (events.example.com): ' public_host
read -r -p 'Super-admin email: ' admin_email
read -r -p 'External configuration directory [/etc/spaceworks-events]: ' config_dir
export SWE_CONFIG_DIR=${config_dir:-/etc/spaceworks-events}
[[ "$SWE_CONFIG_DIR" = /* ]] || { echo 'Use an absolute configuration path.' >&2; exit 1; }
case "$SWE_CONFIG_DIR/" in "$repo_dir/"*) echo 'Keep production configuration outside the checkout.' >&2; exit 1 ;; esac
[[ ! -e "$SWE_CONFIG_DIR/compose.env" ]] || { echo 'Configuration already exists. Follow the upgrade procedure; setup never replaces secrets.' >&2; exit 1; }
read -r -p 'Verified sender (Space Works Events <events@example.com>): ' EMAIL_FROM
read -r -p 'SMTP hostname: ' SMTP_HOST
read -r -p 'SMTP port [587]: ' SMTP_PORT
SMTP_PORT=${SMTP_PORT:-587}
read -r -p 'Use implicit TLS (port 465)? [y/N]: ' smtp_tls
SMTP_SECURE=false
[[ "$smtp_tls" != y && "$smtp_tls" != Y ]] || SMTP_SECURE=true
read -r -p 'SMTP username: ' SMTP_USER
read -r -s -p 'SMTP password (hidden): ' SMTP_PASSWORD
printf '\n'
export EMAIL_FROM SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASSWORD
version="vps-$(git rev-parse --short HEAD)"
printf '\nDeploy commit %s to https://%s\nConfiguration: %s\nAdmin: %s\n' "$(git rev-parse --short HEAD)" "$public_host" "$SWE_CONFIG_DIR" "$admin_email"
echo 'This creates Docker images/volumes, applies migrations and opens ports 80/443.'
echo 'DNS must point here. Retain encrypted off-server backups of data and configuration.'
read -r -p 'Proceed with installation? [y/N]: ' proceed
[[ "$proceed" = y || "$proceed" = Y ]] || exit 0
if [[ ! -d "$SWE_CONFIG_DIR" ]]; then
  if mkdir -m 0700 "$SWE_CONFIG_DIR" 2>/dev/null; then :
  else sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$SWE_CONFIG_DIR"; fi
fi
chmod 0700 "$SWE_CONFIG_DIR"
docker build --target ops --tag swevents-ops:bootstrap .
docker run --rm --user "$(id -u):$(id -g)" --volume "$SWE_CONFIG_DIR:/config" \
  swevents-ops:bootstrap node docker/vps/setup.mjs "$public_host" "$admin_email" "$version"
docker run --rm --user "$(id -u):$(id -g)" --volume "$SWE_CONFIG_DIR:/config" \
  --env EMAIL_FROM --env SMTP_HOST --env SMTP_PORT --env SMTP_SECURE --env SMTP_USER --env SMTP_PASSWORD \
  swevents-ops:bootstrap node docker/vps/configure-smtp.mjs
unset SMTP_PASSWORD SMTP_USER
scripts/vps-compose.sh config --quiet
scripts/vps-compose.sh build ops migrator app
scripts/vps-compose.sh run --rm --no-deps ops node docker/vps/check.mjs preflight
scripts/vps-compose.sh up -d --wait --wait-timeout 180
scripts/vps-compose.sh run --rm --no-deps ops node docker/vps/check.mjs
printf '\nStack ready. Verify public HTTPS at https://%s/api/health\n' "$public_host"
echo 'Create and verify the configured admin account, enable MFA, then test real email and uploads.'
echo 'Before accepting registrations, complete the checks and backup steps in docs/DEPLOYMENT_VPS.md.'
