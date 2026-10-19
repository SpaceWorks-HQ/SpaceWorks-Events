#!/bin/sh
# Use an explicit production project/file; never load the development .env.
set -eu
: "${SWE_CONFIG_DIR:?Set SWE_CONFIG_DIR to the absolute external configuration directory}"
case "$SWE_CONFIG_DIR" in /*) ;; *) echo 'SWE_CONFIG_DIR must be absolute.' >&2; exit 1 ;; esac
export SWE_CONFIG_DIR
# The saved release/hostname are authoritative, even in an old operator shell.
unset PUBLIC_HOST PUBLIC_ORIGIN SITE_HOST SWE_VERSION SWE_LAYOUT SWE_CADDYFILE SWE_CADDY_OPTIONS \
  SWE_BACKEND_IMAGE SWE_FRONTEND_IMAGE COMPOSE_PROFILES
# Use Compose's direct builder; Bake may reject an external secret-file path.
export COMPOSE_BAKE=false
repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
setting() { sed -n "s/^$1='\{0,1\}\([^']*\)'\{0,1\}$/\1/p" "$SWE_CONFIG_DIR/compose.env" 2>/dev/null | tail -n 1; }
# The split layout runs the frontend container too.
if [ "$(setting SWE_LAYOUT)" = split ]; then export COMPOSE_PROFILES=split; fi
# Prepended in reverse: the base file first, then the internal-TLS override.
if [ "$(setting SWE_CADDY_TLS)" = internal ]; then set -- --file "$repo_dir/compose.internal-tls.yml" "$@"; fi
set -- --file "$repo_dir/compose.production.yml" "$@"
exec docker compose --project-name swevents --env-file "$SWE_CONFIG_DIR/compose.env" "$@"
