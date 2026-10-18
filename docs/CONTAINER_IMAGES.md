# Container image publishing (GitHub Container Registry)

[Documentation index](README.md) · [Docker deployment](DEPLOYMENT_DOCKER.md)

> The default free-tier deployment ([Render](DEPLOYMENT_CLOUD.md)) builds
> from the repository itself and does not need these images. Use them for the
> [Docker host](DEPLOYMENT_DOCKER.md) and [Helm](../charts/spaceworks-events/README.md)
> deployments.

The `Publish container images` workflow runs after `Quality gate` succeeds
for a push to `main`. It checks out that exact tested commit and publishes two
images for Linux x86-64 and ARM64:

```text
ghcr.io/spaceworks-hq/spaceworks-events
ghcr.io/spaceworks-hq/spaceworks-events-migrator
```

Pull requests never publish. The workflow builds and pushes images only; it
does not contact a server or apply database migrations.

## One-time setup

1. The workflow authenticates with the built-in `GITHUB_TOKEN`
   (`permissions: packages: write`). No registry token is needed.
2. In the GitHub repository, open **Settings → Secrets and variables →
   Actions** and add:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `NEXT_PUBLIC_BASE_URL` | Production HTTPS origin, e.g. `https://events.example.com`, without a trailing slash |
| Secret | `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | The same stable base64 AES key supplied to every application replica |

3. After the first publish, open each package under the organisation's
   **Packages** tab and confirm its visibility is **Private**. The application
   build contains instance-specific Server Actions material, so restrict
   pulls to trusted operators. Each image carries an
   `org.opencontainers.image.source` label that links it to this repository.
4. Servers pull with a personal access token (classic) that has only
   `read:packages`, or a fine-grained token with read access to packages:
   `echo "$TOKEN" | docker login ghcr.io -u USERNAME --password-stdin`.

For a new installation, generate the Server Actions key once in your secrets
manager or with `openssl rand -base64 32` in a trusted terminal. Store that
same value in GitHub and in the deployment environment. For an existing
instance, reuse its key; never generate a new one per build. The MFA
encryption key is separate and is not used by this workflow.

The production hostname is compiled into the image. The server's `AUTH_URL`
and `NEXT_PUBLIC_BASE_URL` must match it; after changing the hostname
variable, publish a new image. Database, Redis, SMTP and S3 credentials stay
on the server; do not add them to this workflow.

Changing anything under `.github/workflows/` needs a GitHub credential with
the `workflow` scope (for the GitHub CLI: `gh auth refresh -s workflow`).

## Publish a release

1. Merge the change into `main`. The publishing workflow must exist on the
   repository's default branch, assumed here to be `main`.
2. Watch **Actions → Quality gate**. All checks, including the dependency
   audit, integration tests and production browser tests, must pass.
3. Watch **Actions → Publish container images**. Its summary lists the tags
   and immutable digests.

Both images receive the same tag:

```text
ghcr.io/spaceworks-hq/spaceworks-events:sha-COMMIT_SHA-RUN_ID-ATTEMPT
ghcr.io/spaceworks-hq/spaceworks-events-migrator:sha-COMMIT_SHA-RUN_ID-ATTEMPT
```

Each attempt has a unique tag and no `latest` tag is created. Deploy by
digest from the summary. Treat the release as ready only when the whole job
succeeds: if the second build fails, the first image may already exist.

To retry, use **Re-run failed jobs**. To rebuild after changing build
settings, re-run a successful `Quality gate` run that was triggered by a push
to `main`.

## Server handoff

A server can pull both images without Node.js or a source checkout. Run the
migrator image as a separate release step before replacing the application
container, or set `MIGRATE_ON_START=1` on the application container where no
release step exists. Follow [Docker deployment](DEPLOYMENT_DOCKER.md) for
runtime configuration, migration ordering, readiness and rollback.

## Build secret handling

The Dockerfile reads the Server Actions key from a BuildKit secret mount, so
the CI input is not stored in build-argument metadata. As a fallback, for
builders that only pass build arguments (Render), it also accepts a
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` build arg, which then exists only in the
builder stage, never in the published runner image. Next.js still compiles
key-derived material into the application, so the application image must not
be public. The builder stage is rebuilt every time (`no-cache-filters`) so a
deliberate key change never reuses stale output. See
[Docker's secret-mount documentation](https://docs.docker.com/build/ci/github-actions/secrets/).
