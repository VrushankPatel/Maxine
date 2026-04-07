# Helm Deployment

Maxine now ships with a Helm chart in `charts/maxine/`.

## Why this chart is single-replica by default

Maxine still persists its registry snapshot to local disk and keeps its active
registry in-process. Because of that, the safe default chart topology is:

- one replica
- one namespace-scoped release
- one persistent volume for `/app/data`

The chart does not pretend Maxine is horizontally scalable yet. If you increase
`replicaCount` without adding shared persistence and control-plane coordination,
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
- `auth.adminUsername`: default admin username
- `auth.adminPassword`: default admin password
- `auth.jwtSecret`: JWT signing secret
- `auth.existingSecret`: use an existing secret instead of chart-managed credentials
- `persistence.enabled`: controls the `/app/data` PVC
- `logs.persistence.enabled`: optionally persists `/app/logs`
- `ingress.enabled`: exposes Maxine through an Ingress resource

When using `auth.existingSecret`, the secret must contain:

- `MAXINE_ADMIN_USERNAME`
- `MAXINE_ADMIN_PASSWORD`
- `MAXINE_JWT_SECRET`

An example production-style values file is included at `charts/maxine/values-production-example.yaml`.

## Publish model

The repository now includes:

- a GHCR container publish workflow for the Maxine runtime image
- a Helm chart release workflow that packages charts from `charts/` and publishes them to GitHub Pages

To make the chart installable publicly:

1. Publish the GHCR image and make the image package public if needed.
2. Enable GitHub Pages for this repository and point it at the `gh-pages` branch root.
3. Run the Helm chart publish workflow.

## Operational caveats

- The chart uses `/api/actuator/health` for probes, which checks process health rather than deep dependency readiness.
- Admin credentials are still single-user and environment-driven.
- The chart is appropriate for dev, test, demos, and careful internal deployments, but not yet for HA production service-registry use.
