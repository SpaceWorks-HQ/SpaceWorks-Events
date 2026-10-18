#!/usr/bin/env bash
# Update an installation to this source release, keeping configuration, secrets
# and volumes. The curl installer runs it as root from the staged new release.
# It backs up the database and configuration first, builds the new images and
# migrates. If the new release does not come up healthy it returns to the
# previous release's images; database migrations are never reversed.
#   --yes  skip the confirmation (automation)
set -euo pipefail
set +x
source_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
# shellcheck source=scripts/vps-lib.sh
. "$source_dir/scripts/vps-lib.sh"
assume_yes=0
case "${1:-}" in
  '') ;;
  --yes) assume_yes=1 ;;
  *) die 'Usage: update-vps.sh [--yes]' ;;
esac
require_root
load_config_dir
compose_env="$SWE_CONFIG_DIR/compose.env"
[[ -f "$compose_env" ]] || die "No installation configuration in $SWE_CONFIG_DIR."
revision=$(release_revision "$source_dir")
version=$(release_version "$revision")
previous_version=$(conf_get "$compose_env" SWE_VERSION)
previous_dir=$(readlink -f "$SWE_DIR/current" 2>/dev/null || true)
managed=0
case "$source_dir/" in "$SWE_DIR/releases/"*) managed=1 ;; esac
[[ ${SWE_STAGED:-0} != 1 ]] || managed=1
[[ "$previous_version" != "$version" ]] || { say "Already running $version; nothing to update."; exit 0; }

if [[ $assume_yes = 0 ]]; then
  require_tty
  {
    printf '\nUpdate Space Works Events\n'
    printf '  From:           %s\n' "${previous_version:-unknown}"
    printf '  To:             %s (commit %s)\n' "$version" "$revision"
    printf '  Configuration:  %s (kept as it is)\n' "$SWE_CONFIG_DIR"
    printf 'Steps: back up the database and configuration to %s/backups, build the new\n' "$SWE_CONFIG_DIR"
    printf 'images while the site keeps running, apply database migrations, restart and check.\n'
    printf 'If the new release is unhealthy the previous images are restored automatically;\n'
    printf 'migrations that already ran are not reversed. The site restarts briefly.\n\n'
  } >/dev/tty
  confirm 'Proceed with the update?' Y || { say 'Cancelled. Nothing was changed.'; exit 2; }
fi

[[ $managed = 0 ]] || take_lock
SWE_REPO_DIR=$source_dir
[[ $managed = 0 ]] || SWE_REPO_DIR=$(promote_release "$source_dir" "$revision")
cd "$SWE_REPO_DIR"
say 'Backing up the database and configuration.'
bash "$SWE_REPO_DIR/scripts/vps-backup.sh" --no-objects

phase=deploying
restore_previous() {
  local status=$?
  [[ $status != 0 && $phase = deploying ]] || return 0
  set +e
  warn "The update failed; returning to ${previous_version:-the previous release}."
  mv -f "$compose_env.previous" "$compose_env"
  if [[ -n "$previous_dir" && -f "$previous_dir/scripts/vps-compose.sh" ]]; then
    sh "$previous_dir/scripts/vps-compose.sh" up -d --wait --wait-timeout 300 --remove-orphans \
      || warn "The previous release did not start cleanly. Inspect it with: SWE_CONFIG_DIR=$SWE_CONFIG_DIR $previous_dir/scripts/vps-compose.sh ps"
  else
    warn 'Check out the previous source and run scripts/vps-compose.sh up -d from it.'
  fi
  warn "Migrations that already ran are not reversed. The pre-update backup is in $SWE_CONFIG_DIR/backups."
  exit "$status"
}
trap restore_previous EXIT
cp -p "$compose_env" "$compose_env.previous"
# Only the release label changes; hostnames, secrets and volumes stay.
conf_set "$compose_env" SWE_VERSION "$version"
say 'Building the new images. The site keeps running meanwhile.'
compose config --quiet
compose build ops migrator app
compose run --rm --no-deps ops node docker/vps/check.mjs preflight
compose run --rm migrator
compose run --rm --no-deps ops node scripts/verify-production-schema.mjs
compose up -d --wait --wait-timeout 300 --remove-orphans
compose run --rm --no-deps ops node docker/vps/check.mjs
phase=finished
rm -f "$compose_env.previous"

if [[ $managed = 1 ]]; then
  activate_release "$SWE_REPO_DIR"
  conf_set "$(install_conf)" SWE_RELEASE "$revision"
  # Keep the three newest releases (and their images) for manual rollback.
  count=0
  while IFS= read -r dir; do
    count=$((count + 1))
    name=$(basename "$dir")
    [[ $count -gt 3 && "$name" =~ ^[a-f0-9]{40}$ && "$dir" != "$SWE_REPO_DIR" ]] || continue
    rm -rf -- "$dir"
    old=$(release_version "$name")
    docker image rm "swevents-app:$old" "swevents-migrator:$old" "swevents-ops:$old" >/dev/null 2>&1 || true
  done < <(find "$SWE_DIR/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
fi
say "Updated to $version. Verify sign-in, email, uploads and live check-in."
if [[ -f "$SWE_CONFIG_DIR/frontend.env" ]]; then
  say "Deploy commit $revision to the Netlify frontend too."
fi
