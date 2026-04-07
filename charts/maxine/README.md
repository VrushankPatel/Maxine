# Maxine Helm Chart

This chart deploys Maxine as a single-replica service registry and discovery
server.

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

## Important defaults

- `replicaCount=1` because Maxine does not yet support clustered/shared registry state.
- Persistence is enabled for `/app/data` so the registry snapshot survives restarts.
- Log persistence is disabled by default.
- The chart exposes `/api/actuator/health` as the liveness, readiness, and startup probe target.

## Existing secret format

If you set `auth.existingSecret`, that secret must expose these keys:

- `MAXINE_ADMIN_USERNAME`
- `MAXINE_ADMIN_PASSWORD`
- `MAXINE_JWT_SECRET`

## Production notes

- Set `auth.adminPassword` and `auth.jwtSecret` explicitly before production use.
- Pin `image.tag` to a release tag instead of `latest`.
- If you publish the GHCR container publicly, make the package public after the first push.
- Start from `values-production-example.yaml` and then replace the placeholder values for your cluster.
