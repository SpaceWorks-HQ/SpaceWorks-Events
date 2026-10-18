#!/usr/bin/env bash
# Upgrade an existing installation without replacing configuration or volumes.
set -euo pipefail
set +x
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_dir"
[[ -t 0 ]] || { echo 'Run the updater in an interactive terminal.' >&2; exit 1; }
read -r -p 'Existing configuration directory [/etc/spaceworks-events]: ' config_dir
export SWE_CONFIG_DIR=${config_dir:-/etc/spaceworks-events}
[[ "$SWE_CONFIG_DIR" = /* && -f "$SWE_CONFIG_DIR/compose.env" ]] || { echo 'Existing external configuration is required.' >&2; exit 1; }
revision=$(cat .release 2>/dev/null || git rev-parse HEAD)
version="vps-${revision:0:12}"
printf 'Upgrade to %s using %s\n' "$revision" "$SWE_CONFIG_DIR"
echo 'Review migrations first. This saves the database and configuration locally, then migrates and recreates services.'
echo 'Keep a verified encrypted off-server backup of uploaded objects, database and configuration before proceeding.'
read -r -p 'Backups verified and migrations reviewed; proceed? [y/N]: ' proceed
[[ "$proceed" = y || "$proceed" = Y ]] || exit 2
umask 077
mkdir -p "$SWE_CONFIG_DIR/backups"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
# Read-only snapshot, live writers continue. Full recovery includes object backups.
scripts/vps-compose.sh exec -T postgres pg_dump -U swevents -d swevents -Fc > "$SWE_CONFIG_DIR/backups/pre-upgrade-$stamp.dump.partial"
scripts/vps-compose.sh exec -T postgres pg_restore --list < "$SWE_CONFIG_DIR/backups/pre-upgrade-$stamp.dump.partial" >/dev/null
mv "$SWE_CONFIG_DIR/backups/pre-upgrade-$stamp.dump.partial" "$SWE_CONFIG_DIR/backups/pre-upgrade-$stamp.dump"
# Exclude backups to avoid recursion; this archive contains secrets, keep encrypted off-host.
tar --exclude=backups -czf "$SWE_CONFIG_DIR/backups/config-$stamp.tar.gz" -C "$SWE_CONFIG_DIR" .
cp "$SWE_CONFIG_DIR/compose.env" "$SWE_CONFIG_DIR/backups/compose-$stamp.env"
# Only replace the release label. All existing origins and secrets stay stable.
sed "s/^SWE_VERSION=.*/SWE_VERSION='$version'/" "$SWE_CONFIG_DIR/compose.env" > "$SWE_CONFIG_DIR/compose.env.new"
mv "$SWE_CONFIG_DIR/compose.env.new" "$SWE_CONFIG_DIR/compose.env"
echo "Previous release settings: $SWE_CONFIG_DIR/backups/compose-$stamp.env"
echo 'If the upgrade fails, keep services/data and inspect the failure. Image rollback does not undo migrations.'
scripts/vps-compose.sh config --quiet
scripts/vps-compose.sh build ops migrator app
scripts/vps-compose.sh run --rm --no-deps ops node docker/vps/check.mjs preflight
scripts/vps-compose.sh run --rm migrator
scripts/vps-compose.sh run --rm --no-deps ops node scripts/verify-production-schema.mjs
scripts/vps-compose.sh up -d --wait --wait-timeout 180
scripts/vps-compose.sh run --rm --no-deps ops node docker/vps/check.mjs
echo 'VPS upgraded. Deploy the identical source revision to the separate frontend, then verify sign-in, email, uploads and live check-in.'
