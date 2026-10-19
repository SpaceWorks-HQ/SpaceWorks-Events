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
# Builds compile with a throwaway Server Actions key; the real one is runtime-only.
SWE_BUILD_KEY=${SWE_BUILD_KEY:-$(head -c 32 /dev/urandom | base64 | tr -d '\n')}
export SWE_BUILD_KEY
repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
setting() { sed -n "s/^$1='\{0,1\}\([^']*\)'\{0,1\}$/\1/p" "$SWE_CONFIG_DIR/compose.env" 2>/dev/null | tail -n 1; }
tls=$(setting SWE_CADDY_TLS) storage=$(setting SWE_STORAGE)
# Profiles: the split layout runs the website container; Caddy and bundled Silo
# run unless an existing reverse proxy or an external bucket replaces them.
profiles=''
[ "$(setting SWE_LAYOUT)" != split ] || profiles='split'
[ "$tls" = proxy ] || profiles=${profiles:+$profiles,}caddy
[ "$storage" = external ] || profiles=${profiles:+$profiles,}silo
export COMPOSE_PROFILES="$profiles"
# Prepended in reverse: the base file first, then the overrides.
if [ "$storage" = external ]; then set -- --file "$repo_dir/compose.external-storage.yml" "$@"; fi
case "$tls" in
  internal) set -- --file "$repo_dir/compose.internal-tls.yml" "$@" ;;
  proxy) set -- --file "$repo_dir/compose.external-proxy.yml" "$@" ;;
esac
set -- --file "$repo_dir/compose.production.yml" "$@"
exec docker compose --project-name swevents --env-file "$SWE_CONFIG_DIR/compose.env" "$@"
