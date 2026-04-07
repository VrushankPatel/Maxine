# Helm Deployment

Maxine now ships with a Helm chart in `charts/maxine/`.

## Why this chart is single-replica by default

Maxine still keeps its active registry in-process, so the safe default chart
topology is still:

- one replica
- one namespace-scoped release
- one persistent volume for `/app/data`

The chart no longer pretends that local mode is horizontally scalable. If you
increase `replicaCount` without switching to `maxine.registryStateMode=redis`,
you will create divergent registry state across pods.

## Published install path

The chart is designed to be published as a GitHub Pages Helm repository:

```bash
helm repo add maxine https://vrushankpatel.github.io/Maxine
helm repo update
helm install maxine maxine/maxine --namespace maxine --create-namespace
```

## Key values

- `image.repository`: container image repository, defaults to `ghcr.io/vrushankpatel/maxine`
- `image.tag`: defaults to `latest`, but production should pin a release tag
- `maxine.registryStateMode`: defaults to `local`; `shared-file` is shared-storage coordination, and `redis` is the shared backend for multi-replica installs
- `maxine.redis.url`: optional external Redis URL; if unset and `embeddedRedis.enabled=true`, the chart wires Maxine to the in-release Redis service
- `maxine.redis.keyPrefix`: Redis key prefix used by Maxine
- `auth.adminUsername`: default admin username
- `auth.adminPassword`: default admin password
- `auth.jwtSecret`: JWT signing secret
- `auth.existingSecret`: use an existing secret instead of chart-managed credentials
- `persistence.enabled`: controls the `/app/data` PVC
- `logs.persistence.enabled`: optionally persists `/app/logs`
- `ingress.enabled`: exposes Maxine through an Ingress resource
- `embeddedRedis.enabled`: deploys a single-instance Redis StatefulSet inside the release
- `embeddedRedis.auth.enabled`: protects the embedded Redis instance with a password-backed secret

When using `auth.existingSecret`, the secret must contain:

- `MAXINE_ADMIN_USERNAME`
- `MAXINE_ADMIN_PASSWORD`
- `MAXINE_JWT_SECRET`

When using `embeddedRedis.auth.existingSecret`, the secret must contain:

- `REDIS_PASSWORD`
- `MAXINE_REGISTRY_REDIS_URL`

An example production-style values file is included at `charts/maxine/values-production-example.yaml`.

## Redis-backed install example

```bash
helm install maxine maxine/maxine \
  --namespace maxine \
  --create-namespace \
  --set replicaCount=3 \
  --set maxine.registryStateMode=redis \
  --set embeddedRedis.enabled=true
```

## Publish model

The repository now includes:

- a GHCR container publish workflow for the Maxine runtime image
- a Helm chart release workflow that packages charts from `charts/` and publishes them to GitHub Pages

To make the chart installable publicly:

1. Publish the GHCR image and make the image package public if needed.
2. Enable GitHub Pages for this repository and point it at the `pages` branch root.
3. Run the Helm chart publish workflow.

## Operational caveats

- The chart uses `/api/actuator/health` for probes, which checks process health rather than deep dependency readiness.
- Admin credentials are still single-user and environment-driven.
- `shared-file` mode is a useful first coordination step on shared storage, but it is not a substitute for a true distributed registry backend.
- Redis mode is a real shared backend, but Maxine still needs stronger HA semantics, deeper observability, and more failover testing before it should be treated as a mature distributed registry.
- The embedded Redis option is convenient for a self-contained namespace install, but production environments should usually prefer an external managed Redis with backups and failover.
