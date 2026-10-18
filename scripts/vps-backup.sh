#!/usr/bin/env bash
# Back up the database, the configuration and the uploaded objects into
# $SWE_CONFIG_DIR/backups/<UTC time>/ while the services keep running. The
# database dump is a consistent snapshot; objects are copied one by one.
#   --no-objects  database and configuration only (used before updates)
# Each backup contains every secret: copy it off this server, encrypted.
# SWE_BACKUP_KEEP (default 7) is how many backups stay on this server.
set -euo pipefail
set +x
source_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
# shellcheck source=scripts/vps-lib.sh
. "$source_dir/scripts/vps-lib.sh"
objects=1
case "${1:-}" in
  '') ;;
  --no-objects) objects=0 ;;
  *) die 'Usage: vps-backup.sh [--no-objects]' ;;
esac
require_root
load_config_dir
[[ -f "$SWE_CONFIG_DIR/compose.env" ]] || die "No installation configuration in $SWE_CONFIG_DIR."
keep=${SWE_BACKUP_KEEP:-7}
[[ "$keep" =~ ^[1-9][0-9]*$ ]] || die 'SWE_BACKUP_KEEP must be a positive number.'
[[ ! -d "$SWE_DIR" ]] || take_lock
SWE_REPO_DIR=$source_dir
umask 077
backups="$SWE_CONFIG_DIR/backups"
target="$backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$target.partial"
compose exec -T postgres pg_dump -U swevents -d swevents -Fc > "$target.partial/database.dump"
compose exec -T postgres pg_restore --list < "$target.partial/database.dump" > /dev/null
tar --exclude=./backups -czf "$target.partial/config.tar.gz" -C "$SWE_CONFIG_DIR" .
if [[ $objects = 1 ]]; then
  compose run --rm --no-deps --volume "$target.partial:/backup" --entrypoint mc storage-init \
    mirror --quiet local/spaceworks-events /backup/objects > /dev/null
fi
conf_get "$SWE_CONFIG_DIR/compose.env" SWE_VERSION > "$target.partial/version"
mv "$target.partial" "$target"
# Retention covers backups made by this script only.
find "$backups" -mindepth 1 -maxdepth 1 -type d -name '2*Z' | sort -r | tail -n +"$((keep + 1))" | while IFS= read -r old; do
  rm -rf -- "$old"
done
say "Backup saved to $target ($(du -sh "$target" | cut -f1))."
say 'It contains every secret. Copy it off this server, encrypted, for example:'
say "  sudo tar -czf - -C $backups $(basename "$target") | gpg --symmetric --output swevents-$(basename "$target").tar.gz.gpg"
