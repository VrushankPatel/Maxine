<p align="center">
  <img src="docs/img/logo.png" alt="Maxine logo" />
</p>

## Maxine

<div align="center">
  <a target="_blank" href="https://github.com/VrushankPatel/Maxine/actions/workflows/node.js.yml">
    <img src="https://github.com/VrushankPatel/Maxine/actions/workflows/node.js.yml/badge.svg?branch=master" alt="Maxine CI" />
  </a>
  <a target="_blank" href="https://github.com/VrushankPatel/Maxine/actions/workflows/codeql.yml">
    <img src="https://github.com/VrushankPatel/Maxine/actions/workflows/codeql.yml/badge.svg" alt="CodeQL" />
  </a>
  <a target="_blank" href="https://github.com/VrushankPatel/Maxine/actions/workflows/publish-container.yml">
    <img src="https://github.com/VrushankPatel/Maxine/actions/workflows/publish-container.yml/badge.svg" alt="Publish Maxine Container" />
  </a>
  <a target="_blank" href="https://github.com/VrushankPatel/Maxine/actions/workflows/publish-helm-chart.yml">
    <img src="https://github.com/VrushankPatel/Maxine/actions/workflows/publish-helm-chart.yml/badge.svg" alt="Publish Helm Chart" />
  </a>
  <a target="_blank" href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-teal.svg" alt="MIT License" />
  </a>
</div>

Maxine is a Node.js service registry, discovery service, and operational control
plane for service-to-service communication.

It supports:

- heartbeat-based service registration
- redirect and proxy-based service discovery
- weighted distribution with round robin, consistent hashing, and rendezvous hashing
- local, shared-file, and Redis-backed registry state modes
- Redis lease leadership for leader-protected control-plane work
- optional active upstream health checks
- RBAC-protected config and operational APIs
- audit, alerts, traces, cluster status, and Prometheus-formatted metrics
- Docker, Helm, and multi-language SDK packaging

## Quick Start

### Run locally

```bash
npm install
npm run dev
```

Production-style local run:

```bash
npm start
```

### Run tests

```bash
npm test
```

Coverage:

```bash
npm run genreports
```

### Default local credentials

Unless overridden through environment variables:

- username: `admin`
- password: `admin`

## Runtime Modes

### `local`

- in-memory registry
- local restart recovery through persisted snapshots
- safest default for single-instance use

### `shared-file`

- shared snapshot coordination on shared storage
- useful as a transitional coordination model
- not a replacement for real clustered consensus

### `redis`

- Redis-backed shared registry state
- distributed mutation locking
- lease-based leader election with fencing tokens
- recommended mode for multi-replica Maxine deployments today

## Discovery Modes

### Redirect

`GET /api/maxine/serviceops/discover` resolves a node and redirects the caller
to the upstream.

### Proxy

Maxine can proxy traffic either by:

- calling discovery with proxy mode enabled
- using `/api/maxine/serviceops/proxy/:serviceName/*`

Proxy mode keeps Maxine in the data path, which is useful for operational
visibility and routing control.

## Security and Operations

Maxine now includes:

- JWT-based auth
- RBAC roles for viewer, operator, and admin
- file-backed or env-backed admin credentials
- JWT rotation support through current and previous secrets
- actuator endpoints for:
  - health and info
  - audit events
  - alerts
  - cluster state
  - traces
  - upstream probe state
  - Prometheus-formatted metrics

## Deployment

### Docker

The repository includes a production-oriented [Dockerfile](Dockerfile) and a
GHCR publish workflow.

### Helm

Install from the published chart repository:

```bash
helm repo add maxine https://vrushankpatel.github.io/Maxine
helm repo update
helm install maxine maxine/maxine --namespace maxine --create-namespace
```

Source install:

```bash
helm install maxine ./charts/maxine --namespace maxine --create-namespace
```

Redis-backed multi-replica example:

```bash
helm install maxine maxine/maxine \
  --namespace maxine \
  --create-namespace \
  --set replicaCount=3 \
  --set maxine.registryStateMode=redis \
  --set embeddedRedis.enabled=true
```

See [docs/helm.md](docs/helm.md) and [charts/maxine/README.md](charts/maxine/README.md) for deployment details.

## SDKs

The repository currently ships official SDK work for:

- Node.js: [client-sdk/](client-sdk/)
- Java HTTP client: [client-sdk/java/maxine-client/](client-sdk/java/maxine-client/)
- Java Spring Boot starter: [client-sdk/java/maxine-spring-boot-starter/](client-sdk/java/maxine-spring-boot-starter/)
- Python: [client-sdk/python/](client-sdk/python/)
- Go: [client-sdk/go/](client-sdk/go/)

Top-level SDK guidance lives in [client-sdk/README.md](client-sdk/README.md).

## CI/CD

GitHub Actions is the only CI/CD system for this repository.

Key workflows:

- [`.github/workflows/node.js.yml`](.github/workflows/node.js.yml): test suite, SDK validation, Helm validation
- [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml): code analysis
- [`.github/workflows/load-test.yml`](.github/workflows/load-test.yml): manual load testing
- [`.github/workflows/publish-container.yml`](.github/workflows/publish-container.yml): GHCR image publication
- [`.github/workflows/publish-helm-chart.yml`](.github/workflows/publish-helm-chart.yml): Helm publication to GitHub Pages
- [`.github/workflows/publish-node-sdk.yml`](.github/workflows/publish-node-sdk.yml): GitHub Packages publication for the Node SDK
- [`.github/workflows/publish-java-sdk.yml`](.github/workflows/publish-java-sdk.yml): Maven Central publication for Java artifacts
- [`.github/workflows/publish-python-sdk.yml`](.github/workflows/publish-python-sdk.yml): PyPI publication for the Python SDK

The workflow stack has been refreshed to current GitHub Actions majors and the
Node 24 action runtime path.

## Documentation

- Overview: [docs/index.md](docs/index.md)
- Features: [docs/features.md](docs/features.md)
- API: [docs/api.md](docs/api.md)
- Helm: [docs/helm.md](docs/helm.md)
- Roadmap: [docs/roadmap.md](docs/roadmap.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- OpenAPI: [api-specs/swagger.yaml](api-specs/swagger.yaml)

## Production Status

Maxine is substantially stronger than the original registry prototype, but it is
not yet a fully consensus-backed distributed control plane.

The most important remaining gaps are:

- stronger clustered semantics beyond Redis lease coordination
- deeper proxy controls and failure handling
- richer readiness and upstream health modeling
- external identity, stronger secret management, and transport hardening
- long-term observability integrations and operational runbooks
- frontend build and test automation
- release/version discipline across server, chart, and SDK artifacts

These are tracked in [docs/roadmap.md](docs/roadmap.md) and explained in more
detail for contributors in [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

If you contribute here, keep the user-facing and operator-facing documentation
in sync with the code.

At a minimum, relevant changes should update:

- [README.md](README.md)
- [docs/](docs)
- [api-specs/swagger.yaml](api-specs/swagger.yaml) when the HTTP contract changes
- SDK or Helm docs when those surfaces change

See [CONTRIBUTING.md](CONTRIBUTING.md) for the detailed contribution guide and
the current prioritized backlog.

## License

MIT. See [LICENSE](LICENSE).
