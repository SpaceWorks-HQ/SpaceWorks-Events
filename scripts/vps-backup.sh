#!/usr/bin/env bash
# Back up the database, the configuration and the uploaded objects into
# $SWE_CONFIG_DIR/backups/<UTC time>/ while the services keep running. The
# database dump is a consistent snapshot; objects are copied one by one.
#   --no-objects  database and configuration only (used before updates)
# Each backup contains every secret: copy it off this server, encrypted.
# SWE_BACKUP_KEEP (default 7) is how many backups of each kind (full and
# database-only) stay on this server.
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
compose exec postgres pg_dump -U swevents -d swevents -Fc > "$target.partial/database.dump"
compose exec postgres pg_restore --list < "$target.partial/database.dump" > /dev/null
tar --exclude=./backups -czf "$target.partial/config.tar.gz" -C "$SWE_CONFIG_DIR" .
if [[ $objects = 1 ]]; then
  compose run --rm --no-deps --volume "$target.partial:/backup" --entrypoint mc storage-init \
    mirror --quiet local/spaceworks-events /backup/objects > /dev/null
fi
conf_get "$SWE_CONFIG_DIR/compose.env" SWE_VERSION > "$target.partial/version"
mv "$target.partial" "$target"
# Retention covers backups made by this script only. Full and database-only
# backups are counted separately, so updates never push out the last copy of
# the uploads, and SWE_BACKUP_PROTECT (a restore's source) is never removed.
full=() database_only=()
while IFS= read -r dir; do
  [[ "$(basename "$dir")" != "$(basename "${SWE_BACKUP_PROTECT:-/}")" ]] || continue
  if [[ -d "$dir/objects" ]]; then full+=("$dir"); else database_only+=("$dir"); fi
done < <(find "$backups" -mindepth 1 -maxdepth 1 -type d -name '2*Z' | sort -r)
for dir in "${full[@]:keep}" "${database_only[@]:keep}"; do
  rm -rf -- "$dir"
done
say "Backup saved to $target ($(du -sh "$target" | cut -f1))."
say 'It contains every secret. Copy it off this server, encrypted, for example:'
say "  sudo tar -czf - -C $backups $(basename "$target") | gpg --symmetric --output swevents-$(basename "$target").tar.gz.gpg"
