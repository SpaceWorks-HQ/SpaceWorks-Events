# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
# (The skipped check flags the NEXT_SERVER_ACTIONS_ENCRYPTION_KEY build-arg
# fallback in the builder stage; see the comment there for the tradeoff.)

# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
# `npm ci` runs the Prisma postinstall hook, which needs the schema available.
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

# A small, purpose-built target for CI/CD or Helm pre-upgrade migration Jobs.
# Build and publish this target separately from the application runtime image.
# scripts/prisma.mjs defaults DIRECT_URL to DATABASE_URL when it is unset.
FROM deps AS migrator
WORKDIR /app
COPY prisma ./prisma
COPY scripts/prisma.mjs ./scripts/prisma.mjs
CMD ["node", "scripts/prisma.mjs", "migrate", "deploy"]

# Operator-only image for VPS setup, preflight, schema checks and backups.
# Never serve requests from this image or publish it as the application image.
FROM migrator AS ops
USER root
RUN apk add --no-cache openssl postgresql16-client
COPY scripts ./scripts
COPY docker/vps ./docker/vps
CMD ["node", "scripts/check-production-env.mjs"]

# Prisma CLI only, pinned to the lockfile's version, so the runner can apply
# migrations on start (MIGRATE_ON_START=1) on platforms without a release job,
# such as the Render free plan. Kept apart from the app's node_modules.
FROM node:22-alpine AS prisma-cli
WORKDIR /opt/prisma-cli
COPY --from=deps /app/node_modules/prisma/package.json /tmp/prisma-package.json
RUN npm install --omit=dev --no-save --no-audit --no-fund \
      "prisma@$(node -p "require('/tmp/prisma-package.json').version")" \
    && npm cache clean --force

# Stage 2: Rebuild the source code
FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
# Fallback for builders without BuildKit secrets wired up. Render passes every
# service environment variable to `docker build` as a build arg of the same
# name, so the runtime key is reused for the build without extra setup. The
# value then exists in this builder stage's metadata and build cache, but not
# in the final runner image (a separate stage). Prefer the secret mount below
# wherever the builder supports it (local Docker, GitHub Actions, Compose).
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate
# The key is consumed by Next.js while compiling Server Actions. Every image
# replica must be built with one stable key and receive that same key at runtime.
# A BuildKit secret (`--secret id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,...`, or a
# Render secret file with that name) takes precedence over the build arg.
RUN --mount=type=secret,id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
    if [ -s /run/secrets/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ]; then \
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY)"; \
    fi; \
    if [ -z "$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" ]; then \
      echo "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is required: pass it as a BuildKit secret or build arg." >&2; \
      exit 1; \
    fi; \
    export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY; \
    npm run build

# Stage 3: Production runner (keep this the LAST stage: Render builds the final
# stage because a Blueprint cannot select a build target)
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Sharp renders ticket and certificate SVGs on the server. Alpine has no
# system fonts by default, which otherwise turns every text glyph into a box.
RUN apk add --no-cache font-dejavu && fc-cache -f

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next
RUN chown nextjs:nodejs .next

# Leverage Next.js standalone tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Prisma CLI for the optional MIGRATE_ON_START=1 path (root-owned, read-only).
COPY --from=prisma-cli /opt/prisma-cli/node_modules /opt/prisma-cli/node_modules
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Next's standalone trace may include dotenv files when a build is performed
# from a developer checkout. Secrets belong only in the runtime environment.
RUN rm -f .env .env.local .env.production .env.development

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
