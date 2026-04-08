# Helm Deployment

Maxine ships with a Helm chart in `charts/maxine` and a GitHub Pages-backed Helm
repository publish flow.

## Default Topology

The chart defaults to:

- `replicaCount=1`
- `maxine.registryStateMode=local`
- persistent `/app/data`
- ephemeral `/app/logs`

That default is intentional. Local mode keeps active registry state in-process,
so scaling replicas without shared coordination will create divergent views of
service state.

## Install from the Published Repo

```bash
helm repo add maxine https://vrushankpatel.github.io/Maxine
helm repo update
helm install maxine maxine/maxine --namespace maxine --create-namespace
```

## Install from Source

```bash
helm install maxine ./charts/maxine --namespace maxine --create-namespace
```

## Redis-Backed Multi-Replica Example

```bash
helm install maxine maxine/maxine \
  --namespace maxine \
  --create-namespace \
  --set replicaCount=3 \
  --set maxine.registryStateMode=redis \
  --set embeddedRedis.enabled=true
```

## Important Values

- `image.repository` and `image.tag`
- `maxine.registryStateMode`
- `maxine.cluster.leaderElectionEnabled`
- `maxine.activeHealthChecks.*`
- `maxine.alerts.*`
- `maxine.redis.*`
- `auth.*`
- `persistence.*`
- `logs.persistence.*`
- `ingress.*`
- `embeddedRedis.*`

The chart also injects `MAXINE_INSTANCE_ID` from the pod name so cluster status
and leadership reporting remain instance-aware.

## Existing Secret Requirements

If `auth.existingSecret` is used, that secret must provide:

- `MAXINE_ADMIN_USERNAME`
- `MAXINE_ADMIN_PASSWORD`
- `MAXINE_OPERATOR_USERNAME`
- `MAXINE_OPERATOR_PASSWORD`
- `MAXINE_VIEWER_USERNAME`
- `MAXINE_VIEWER_PASSWORD`
- `MAXINE_JWT_SECRET`

If `embeddedRedis.auth.existingSecret` is used, that secret must provide:

- `REDIS_PASSWORD`
- `MAXINE_REGISTRY_REDIS_URL`

## Publishing Model

Helm publication is handled through GitHub Actions:

- container image publication to GHCR
- chart packaging and GitHub Pages publication

To make public installs work end to end:

1. publish the GHCR image
2. make the image package public if GitHub marks it private on first release
3. enable GitHub Pages for the chart branch
4. run the Helm publish workflow

## Operational Notes

- Probes hit `/api/actuator/health`, which is process health, not deep dependency readiness.
- `shared-file` mode is coordination on shared storage, not distributed consensus.
- Redis mode is the recommended shared-state path, but it is still not a full consensus-backed clustered control plane.
- Embedded Redis is useful for self-contained installs, but production environments should generally prefer managed Redis with backup and failover.
