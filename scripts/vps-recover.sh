#!/usr/bin/env bash
# Set or reset the super admin's password from the server: the only way to do
# either. The first time it creates the account; after that it removes the
# account's MFA and signs it out everywhere. Either way it prints a one-hour
# link to set the password. Only someone with root here can run it.
# shellcheck disable=SC2154 # ask assigns answers by name
set -euo pipefail
set +x
source_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
# shellcheck source=scripts/vps-lib.sh
. "$source_dir/scripts/vps-lib.sh"
require_root
require_tty
load_config_dir
[[ -f "$SWE_CONFIG_DIR/compose.env" ]] || die "No installation configuration in $SWE_CONFIG_DIR."
SWE_REPO_DIR=$source_dir
ask email 'Super-admin email' "$(conf_get "$SWE_CONFIG_DIR/app.env" SUPER_ADMIN_EMAIL)" is_email 'Enter an email address.'
cat >/dev/tty <<EOF

This sets the password of $email: it creates the account if there is none,
otherwise removes its authenticator and recovery codes and signs it out on
every device. It prints a link valid for one hour, and is recorded in the
audit log.
EOF
confirm 'Continue?' N || { say 'Cancelled. Nothing was changed.'; exit 2; }
compose run --rm --no-deps ops node docker/vps/recover-super-admin.mjs "$email"
