# Build and publish to Docker Hub

[Documentation index](README.md) · [Docker deployment](DEPLOYMENT_DOCKER.md)

The `Publish Docker Hub images` workflow runs after `Quality gate` succeeds
for a push to `main`. It checks out that exact tested commit and publishes
both `yuyu` and `yuyu-migrator` for Linux x86-64 and ARM64. Pull requests never
publish. The workflow builds and pushes images; it does not contact the server
or apply database migrations.

## One-time setup

1. In Docker Hub, create **private** repositories named `yuyu` and
   `yuyu-migrator` under the same account or organisation. The application
   build contains instance-specific Server Actions material, so restrict image
   access to trusted operators.
2. Create a Docker Hub access token with **Read & Write** access to these
   repositories. Use a separate read-only token on the deployment server.
3. In the GitHub repository, open **Settings → Secrets and variables → Actions**.
   Add the following repository variables and secrets. Do not put credentials
   in workflow files or paste them into a conversation.

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `DOCKERHUB_USERNAME` | Docker Hub login that owns the token |
| Variable | `DOCKERHUB_NAMESPACE` | Account or organisation owning both repositories |
| Variable | `NEXT_PUBLIC_BASE_URL` | Production HTTPS origin, e.g. `https://events.example.com`, without a trailing slash |
| Secret | `DOCKERHUB_TOKEN` | Docker Hub token with permission to push both repositories |
| Secret | `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | The same stable base64 AES key supplied to every application replica |

For a new installation, generate the Server Actions key once in your secrets
manager or using `openssl rand -base64 32` in a trusted terminal. Store that
same value in GitHub and the deployment environment. For an existing instance,
reuse its key. Do not generate a new key on every build. The MFA encryption key
is separate and is not required by this publishing workflow.

The production hostname is compiled into the image. The server's `AUTH_URL`
and `NEXT_PUBLIC_BASE_URL` must match it. After changing the hostname variable,
publish a new image. Production database, Redis, SMTP and S3 credentials stay
on the server; do not add them to this build workflow.

## Publish a release

1. Commit the workflow and Docker changes, then push or merge them into `main`.
   The publishing workflow must exist on the repository's default branch;
   this setup assumes that branch is `main`.
2. Watch **Actions → Quality gate**. All checks, including dependency audit,
   integration tests and production browser tests, must succeed. Resolve audit
   failures before publishing; the workflow does not bypass them.
3. Watch **Actions → Publish Docker Hub images**. After both pushes succeed,
   its summary lists the image tags and immutable digest references.

Both repositories receive the same tag:

```text
YOUR_NAMESPACE/yuyu:sha-COMMIT_SHA-RUN_ID-ATTEMPT
YOUR_NAMESPACE/yuyu-migrator:sha-COMMIT_SHA-RUN_ID-ATTEMPT
```

Each publishing attempt has a unique tag. No `latest` tag is created. Use the
digest references from the summary when configuring the eventual server
deployment. Treat the release as ready only after the entire publishing job
succeeds: if the second build fails, the first image may already exist.

To retry a failed publication, use GitHub Actions' **Re-run failed jobs**. To
rebuild after changing build settings, re-run a successful `Quality gate` run
originally triggered by a push to `main`; its completion triggers publication
again. Select the intended source commit when doing this.

## Server handoff

The server can later pull the two published images without Node.js or a source
checkout. Keep database migration execution as a separate release step before
replacing the application container. Follow [Docker deployment](DEPLOYMENT_DOCKER.md)
for runtime configuration, migration ordering, readiness and rollback.

## Build secret handling

The Dockerfile uses a BuildKit secret mount for the Server Actions key instead
of a build argument. This avoids including the input in build-argument
metadata. Next.js still consumes the key in its compiled application, so this
does not make the application image safe to publish publicly. The application
builder stage is rebuilt each time to avoid stale output after a deliberate
key change. See [Docker's secret-mount documentation](https://docs.docker.com/build/ci/github-actions/secrets/).
