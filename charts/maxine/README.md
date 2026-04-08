# Maxine Helm Chart

This chart deploys Maxine as a service registry and discovery server, with a
single-replica local-state default and an optional Redis-backed multi-replica
mode.

## Install from the published GitHub Pages repo

```bash
helm repo add maxine https://vrushankpatel.github.io/Maxine
helm repo update
helm install maxine maxine/maxine --namespace maxine --create-namespace
```

## Install from the source tree

```bash
helm install maxine ./charts/maxine --namespace maxine --create-namespace
```

## Redis-backed multi-replica install

```bash
helm install maxine maxine/maxine \
  --namespace maxine \
  --create-namespace \
  --set replicaCount=3 \
  --set maxine.registryStateMode=redis \
  --set embeddedRedis.enabled=true
```

## Important defaults

- `replicaCount=1` because local mode is still the safest default.
- Persistence is enabled for `/app/data` so the registry snapshot survives restarts.
- Log persistence is disabled by default.
- The chart exposes `/api/actuator/health` as the liveness, readiness, and startup probe target.
- `maxine.registryStateMode` defaults to `local`; `shared-file` is still shared-storage coordination, while `redis` is the first shared-state option for multi-replica installs.
- `maxine.cluster.leaderElectionEnabled=true` keeps leader-protected control-plane mutations tied to a single lease holder in Redis mode.
- `maxine.activeHealthChecks.enabled=false` by default so services are not unexpectedly evicted unless probing is explicitly configured.
- `embeddedRedis.enabled=false` by default so production users can point Maxine at an external Redis if preferred.
- The chart injects `MAXINE_INSTANCE_ID` from the pod name for cluster status and leadership reporting.

## Existing secret format

If you set `auth.existingSecret`, that secret must expose these keys:

- `MAXINE_ADMIN_USERNAME`
- `MAXINE_ADMIN_PASSWORD`
- `MAXINE_OPERATOR_USERNAME`
- `MAXINE_OPERATOR_PASSWORD`
- `MAXINE_VIEWER_USERNAME`
- `MAXINE_VIEWER_PASSWORD`
- `MAXINE_JWT_SECRET`

If you enable `embeddedRedis.auth.enabled` with `embeddedRedis.auth.existingSecret`, that secret must expose:

- `REDIS_PASSWORD`
- `MAXINE_REGISTRY_REDIS_URL`

## Production notes

- Set `auth.adminPassword` and `auth.jwtSecret` explicitly before production use.
- Configure `auth.operator*` and `auth.viewer*` if you want RBAC-separated operational access.
- Enable `maxine.activeHealthChecks` only after you have valid upstream health endpoints to probe.
- Pin `image.tag` to a release tag instead of `latest`.
- If you publish the GHCR container publicly, make the package public after the first push.
- Start from `values-production-example.yaml` and then replace the placeholder values for your cluster.
- Prefer an external managed Redis for production instead of the embedded single-instance Redis.
