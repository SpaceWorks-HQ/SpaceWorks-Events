#!/bin/sh
# Use an explicit production project/file; never load the development .env.
set -eu
: "${SWE_CONFIG_DIR:?Set SWE_CONFIG_DIR to the absolute external configuration directory}"
case "$SWE_CONFIG_DIR" in /*) ;; *) echo 'SWE_CONFIG_DIR must be absolute.' >&2; exit 1 ;; esac
export SWE_CONFIG_DIR
# The saved release/hostname are authoritative, even in an old operator shell.
unset PUBLIC_HOST PUBLIC_ORIGIN SWE_VERSION SWE_APP_IMAGE SWE_MIGRATOR_IMAGE SWE_OPS_IMAGE
# Use Compose's direct builder; Bake may reject an external secret-file path.
export COMPOSE_BAKE=false
repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
exec docker compose --project-name swevents --env-file "$SWE_CONFIG_DIR/compose.env" --file "$repo_dir/compose.production.yml" "$@"
