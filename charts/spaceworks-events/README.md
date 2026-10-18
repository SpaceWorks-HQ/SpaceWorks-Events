# Space Works Events Helm chart

Use this chart only on Kubernetes. For a single VPS or another container host
without Kubernetes, use the
[production Docker deployment guide](../../docs/DEPLOYMENT_DOCKER.md) instead.

## Images

Publish two images from the same commit and use immutable tags:

```bash
docker build --target migrator -t ghcr.io/spaceworks-hq/spaceworks-events-migrator:VERSION .
docker build --target runner \
  --secret id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY --build-arg NEXT_PUBLIC_BASE_URL="$NEXT_PUBLIC_BASE_URL" \
  -t ghcr.io/spaceworks-hq/spaceworks-events:VERSION .
```

The Server Actions key is required by the application build, not the migrator
build. It must be present at application runtime with the same stable value.

## Runtime secret

Create the namespace and a Kubernetes Secret outside Helm. It must include every production value required by `.env.production.example` / `npm run production:check`, including `DIRECT_URL` when `DATABASE_URL` goes through a transaction pooler (the migration Job falls back to `DATABASE_URL` otherwise).

```bash
kubectl create namespace swevents
kubectl -n swevents create secret generic spaceworks-events-runtime --from-env-file=/secure/path/swevents.env
```

Use External Secrets or Sealed Secrets in a real production cluster; do not commit the secret manifest.

## Install

Create a `values-production.yaml` outside source control:

```yaml
image:
  repository: ghcr.io/spaceworks-hq/spaceworks-events
  tag: "VERSION"
migration:
  image:
    repository: ghcr.io/spaceworks-hq/spaceworks-events-migrator
    tag: "VERSION"
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: events.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: events-example-com-tls
      hosts: [events.example.com]
```

Validate and deploy:

```bash
helm lint charts/spaceworks-events
helm upgrade --install spaceworks-events charts/spaceworks-events --namespace swevents --create-namespace --values /secure/path/values-production.yaml --wait --timeout 10m
```

The migration Job is a Helm pre-install/pre-upgrade hook. A failed migration blocks the application rollout.
