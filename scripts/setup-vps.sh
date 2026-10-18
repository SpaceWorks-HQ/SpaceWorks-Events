#!/usr/bin/env bash
# Guided first installation only. Existing installs use the update procedure.
set -euo pipefail
set +x
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_dir"
[[ -t 0 ]] || { echo 'Run this installer in an interactive terminal.' >&2; exit 1; }
read -r -p 'Hosting mode: 1 = whole VPS, 2 = Netlify frontend + VPS backend [1]: ' hosting_mode
frontend_host=
case ${hosting_mode:-1} in
  1) read -r -p 'Public hostname (events.example.com): ' public_host ;;
  2) read -r -p 'VPS API hostname (api.events.example.com): ' public_host
     read -r -p 'Frontend hostname (events.example.com or your-site.netlify.app): ' frontend_host ;;
  *) echo 'Choose 1 or 2.' >&2; exit 1 ;;
esac
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
revision=$(cat .release 2>/dev/null || git rev-parse HEAD)
version="vps-${revision:0:12}"
host_pattern='^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
[[ "$public_host" =~ $host_pattern && ${#public_host} -le 253 ]] || { echo 'Enter a valid public DNS hostname.' >&2; exit 1; }
[[ -z "$frontend_host" || ( "$frontend_host" =~ $host_pattern && "$frontend_host" != "$public_host" ) ]] || { echo 'Enter a distinct frontend hostname.' >&2; exit 1; }
[[ "$admin_email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || { echo 'Enter a valid admin email.' >&2; exit 1; }
[[ "$SMTP_PORT" =~ ^[0-9]{1,5}$ && "$SMTP_PORT" -gt 0 && "$SMTP_PORT" -le 65535 && -n "$SMTP_HOST" && -n "$SMTP_USER" && -n "$SMTP_PASSWORD" && -n "$EMAIL_FROM" ]] || { echo 'Complete the SMTP settings with a valid port.' >&2; exit 1; }
[[ "$SWE_CONFIG_DIR" != *[[:space:]:]* ]] || { echo 'Use a configuration path without spaces or colons.' >&2; exit 1; }

printf '\nDeploy commit %s to https://%s\nConfiguration: %s\nAdmin: %s\n' "$revision" "$public_host" "$SWE_CONFIG_DIR" "$admin_email"
[[ -z "$frontend_host" ]] || printf 'Frontend: https://%s (deploy separately using generated frontend.env)\n' "$frontend_host"
echo 'This creates Docker images/volumes, applies migrations and opens ports 80/443.'
echo 'DNS must point here. Retain encrypted off-server backups of data and configuration.'
read -r -p 'Proceed with installation? [y/N]: ' proceed
[[ "$proceed" = y || "$proceed" = Y ]] || exit 2
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  [[ ${SWE_INSTALL_DOCKER:-0} = 1 ]] || { echo "Install Docker Engine + Compose first, or use the curl installer." >&2; exit 1; }
  bash scripts/install-docker.sh
fi
docker info >/dev/null
if [[ ! -d "$SWE_CONFIG_DIR" ]]; then
  if mkdir -m 0700 "$SWE_CONFIG_DIR" 2>/dev/null; then :
  else sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$SWE_CONFIG_DIR"; fi
fi
chmod 0700 "$SWE_CONFIG_DIR"
docker build --target ops --tag swevents-ops:bootstrap .
docker run --rm --user "$(id -u):$(id -g)" --volume "$SWE_CONFIG_DIR:/config" \
  swevents-ops:bootstrap node docker/vps/setup.mjs "$public_host" "$admin_email" "$version" "$frontend_host"
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

if [[ -n "$frontend_host" ]]; then
  printf "Frontend configuration: %s/frontend.env (server build/runtime settings in Netlify).\n" "$SWE_CONFIG_DIR"
  echo "Set Netlify Package directory to frontend, leave Base directory at repository root, and use frontend/netlify.toml. See docs/DEPLOYMENT_SPLIT.md."
fi
