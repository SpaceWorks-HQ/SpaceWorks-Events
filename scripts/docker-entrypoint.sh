#!/bin/sh
# Entrypoint for the Docker `runner` image.
#
# Published release images are built once for every installation, with a
# placeholder public origin compiled in where Next.js inlines
# NEXT_PUBLIC_BASE_URL. Before the server starts, the placeholder is replaced
# with this installation's NEXT_PUBLIC_BASE_URL. Images built with a real
# origin (Render, a local `docker build`) contain no placeholder and skip this.
#
# With MIGRATE_ON_START=1 the container applies pending Prisma migrations
# before starting the server. This exists for platforms without a separate
# release/pre-deploy job (the Render free plan). Elsewhere, keep it unset and
# run the `migrator` image (or the Helm migration Job) once per release.
#
# Migrations use DIRECT_URL (a direct or session-mode connection), falling
# back to DATABASE_URL. A failed migration exits non-zero, so the new
# deployment never becomes healthy and the previous one keeps serving.
set -eu

placeholder_host='spaceworks-events-origin.invalid'
placeholder_pattern='spaceworks-events-origin\.invalid'
built=${SWE_NEXT_DIR:-/app/.next}   # overridden only by tests
if grep -rqF "$placeholder_host" "$built" 2>/dev/null; then
  origin="${NEXT_PUBLIC_BASE_URL:-}"
  # Validated before use in sed: no characters that are special to sed or JS strings.
  if ! printf '%s' "$origin" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then
    echo "[entrypoint] Set NEXT_PUBLIC_BASE_URL to this site's origin, such as https://events.example.com (no path or trailing slash)." >&2
    exit 1
  fi
  host="${origin#*://}"
  echo "[entrypoint] Applying the public origin $origin"
  grep -rlF "$placeholder_host" "$built" | while IFS= read -r file; do
    sed -i -e "s|https://$placeholder_pattern|$origin|g" -e "s|$placeholder_pattern|$host|g" "$file"
  done
  if grep -rqF "$placeholder_host" "$built"; then
    echo "[entrypoint] The public origin could not be applied to every file." >&2
    exit 1
  fi
fi

if [ "${MIGRATE_ON_START:-0}" = "1" ]; then
  echo "[entrypoint] Applying database migrations (MIGRATE_ON_START=1)"
  DIRECT_URL="${DIRECT_URL:-${DATABASE_URL:-}}" CHECKPOINT_DISABLE=1 \
    node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma
fi

exec "$@"
