#!/usr/bin/env bash
# Restore the database, and the uploaded objects when the backup has them, from
# a directory made by vps-backup.sh. This replaces live data: the app, Caddy and
# the scheduler stop until the restore finishes, and a fresh database backup is
# taken first. The configuration archive in the backup is not applied here; on a
# new server restore it before setup (see docs/DEPLOYMENT_VPS.md).
#   vps-restore.sh /etc/spaceworks-events/backups/<time> [--yes]
# shellcheck disable=SC2154 # ask assigns answers by name
set -euo pipefail
set +x
source_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
# shellcheck source=scripts/vps-lib.sh
. "$source_dir/scripts/vps-lib.sh"
backup=${1:-}
assume_yes=0
case "${2:-}" in
  '') ;;
  --yes) assume_yes=1 ;;
  *) backup='' ;;
esac
[[ -n "$backup" && $# -le 2 ]] || die 'Usage: vps-restore.sh BACKUP_DIRECTORY [--yes]'
backup=$(CDPATH='' cd -- "$backup" 2>/dev/null && pwd) || die 'The backup directory does not exist.'
[[ -s "$backup/database.dump" ]] || die "$backup has no database.dump; choose a directory made by vps-backup.sh."
require_root
load_config_dir
[[ -f "$SWE_CONFIG_DIR/compose.env" ]] || die "No installation configuration in $SWE_CONFIG_DIR."
[[ ! -d "$SWE_DIR" ]] || take_lock
SWE_REPO_DIR=$source_dir
has_objects=0
[[ ! -d "$backup/objects" ]] || has_objects=1
if [[ $assume_yes = 0 ]]; then
  require_tty
  {
    printf '\nRestore %s\n' "$backup"
    printf '  Backed up from: %s\n' "$(cat "$backup/version" 2>/dev/null || echo 'unknown release')"
    printf '  Database:       replaced with the backup (registrations, accounts, events...)\n'
    if [[ $has_objects = 1 ]]; then printf '  Uploads:        files from the backup are put back; newer files stay\n'
    else printf '  Uploads:        not in this backup; left as they are\n'; fi
    printf 'The site is offline during the restore. A backup of the current database is taken first.\n\n'
  } >/dev/tty
  ask answer 'Type RESTORE to continue' '' is_nonempty
  [[ "$answer" = RESTORE ]] || { say 'Cancelled. Nothing was changed.'; exit 2; }
fi
SWE_BACKUP_PROTECT=$backup bash "$SWE_REPO_DIR/scripts/vps-backup.sh" --no-objects
# A failed restore must not leave the site down; the database restore is one
# transaction, so a failure there keeps the current data.
stopped=0
restart_on_failure() {
  local status=$?
  [[ $status != 0 && $stopped = 1 ]] || return 0
  warn 'The restore failed; starting the services again.'
  compose up -d >/dev/null 2>&1 || warn 'Start them with scripts/vps-compose.sh up -d.'
  exit "$status"
}
trap restart_on_failure EXIT
stopped=1
compose stop proxy scheduler app
compose exec -T postgres pg_restore -U swevents -d swevents --clean --if-exists --single-transaction --exit-on-error \
  < "$backup/database.dump"
if [[ $has_objects = 1 ]]; then
  compose run --rm --no-deps --volume "$backup:/backup:ro" --entrypoint mc storage-init \
    mirror --overwrite --quiet /backup/objects local/spaceworks-events > /dev/null
fi
# Migrations bring an older backup up to this release before the app starts.
compose up -d --wait --wait-timeout 300
compose run --rm --no-deps ops node docker/vps/check.mjs
say 'Restore finished. Sign in and check recent events, registrations and uploads.'
