# Contributing to Maxine

Thanks for contributing to Maxine.

This repository is no longer in the "experimental notes" phase. Contributions
should move the project toward a dependable service registry, reverse-proxy
control plane, and packaged platform component. That means code, tests, docs,
Helm, SDKs, and API contracts need to move together.

## Before You Start

Please read these first:

- [README.md](README.md)
- [docs/index.md](docs/index.md)
- [docs/roadmap.md](docs/roadmap.md)
- [api-specs/swagger.yaml](api-specs/swagger.yaml)

## Ground Rules

Every meaningful change should keep these in sync:

- [README.md](README.md)
- [docs/](docs)
- [api-specs/swagger.yaml](api-specs/swagger.yaml) for externally visible API changes
- relevant SDK READMEs under [client-sdk/](client-sdk)
- Helm docs under [docs/helm.md](docs/helm.md) and [charts/maxine/README.md](charts/maxine/README.md) when deployment behavior changes

If a change affects runtime behavior but the docs do not change, treat that as
unfinished work.

## Local Setup

### Server

```bash
npm install
npm run dev
```

Production-style local run:

```bash
npm start
```

### Tests

```bash
npm test
```

Coverage:

```bash
npm run genreports
```

### SDK verification

Java:

```bash
mvn -B -f client-sdk/java/pom.xml -DskipTests package
```

Python:

```bash
python -m pip install --upgrade pip build
python -m build client-sdk/python
PYTHONPATH=client-sdk/python python -m unittest discover -s client-sdk/python/tests -v
```

Go:

```bash
cd client-sdk/go && go test ./...
```

### Helm validation

```bash
helm lint charts/maxine
helm template maxine charts/maxine >/tmp/maxine-chart.yaml
```

## Contribution Workflow

1. Start from the latest `master`.
2. Make the code change.
3. Add or update tests.
4. Update docs and the API spec if the change is externally visible.
5. Run the relevant checks locally.
6. Keep the diff focused. Avoid unrelated cleanup in the same change.

## What We Need Most

The sections below are the highest-value contribution areas. They are written as
implementation guidance, not just a wish list.

### 1. Distributed Control Plane Hardening

Current status:

- Redis-backed shared state exists.
- Lease-based leader election with fencing tokens exists.
- Leader-protected config mutation exists.

What is still missing:

- A real consensus-backed control plane. Redis leasing is coordination, not a replicated state machine.
- Stronger split-brain handling and failover guarantees.
- Operational proof that the leader/follower model behaves correctly during network partitions, process crashes, Redis failover, and clock drift scenarios.
- More leadership-aware mutation surfaces beyond config updates.

Good contribution targets:

- design and prototype a consensus-backed architecture
- improve leadership lifecycle tests and failure simulations
- strengthen fencing enforcement where state can still be mutated concurrently
- document failover behavior and cluster runbooks

Relevant files:

- [src/main/service/cluster-leader-service.js](src/main/service/cluster-leader-service.js)
- [src/main/service/registry-state-service.js](src/main/service/registry-state-service.js)
- [src/main/service/registry-service.js](src/main/service/registry-service.js)
- [charts/maxine/values.yaml](charts/maxine/values.yaml)

### 2. Proxy and Discovery Maturity

Current status:

- Maxine can redirect discovered requests.
- Maxine can also proxy requests through `/api/maxine/serviceops/proxy/:serviceName/*`.
- Trace headers are propagated across proxy hops.

What is still missing:

- richer proxy timeout handling
- per-route policy controls
- better streaming coverage and edge-case validation
- request/response shaping rules for headers, bodies, and retries
- more operational controls around upstream failures

Good contribution targets:

- add proxy-specific tests for larger payloads, streaming, and error handling
- add configurable upstream timeouts and retry policy
- add request logging fields specific to proxy mode
- expose clearer proxy-mode metrics

Relevant files:

- [src/main/service/proxy-service.js](src/main/service/proxy-service.js)
- [src/main/controller/maxine/discovery-controller.js](src/main/controller/maxine/discovery-controller.js)
- [src/main/controller/maxine/proxy-controller.js](src/main/controller/maxine/proxy-controller.js)
- [src/test/unit-tests/proxy-health.test.js](src/test/unit-tests/proxy-health.test.js)

### 3. Upstream Health and Eviction Model

Current status:

- Heartbeat expiry exists.
- Active health checks exist and are opt-in.
- Failed upstreams can be evicted after repeated probe failures.

What is still missing:

- readiness vs liveness distinction
- per-service probe configuration depth
- better re-entry behavior for recovered services
- managed dependency guidance for production clusters
- richer alerts and dashboards around unhealthy upstreams

Good contribution targets:

- improve probe configuration and reporting
- add service-level overrides beyond a single `healthCheckPath`
- test recovery and re-registration flows after active eviction
- export richer health metrics

Relevant files:

- [src/main/service/upstream-health-service.js](src/main/service/upstream-health-service.js)
- [src/main/entity/service-body.js](src/main/entity/service-body.js)
- [src/main/service/registry-service.js](src/main/service/registry-service.js)

### 4. Security, Identity, and Secret Management

Current status:

- viewer / operator / admin roles exist
- JWT rotation support exists through current and previous secrets
- audit events exist

What is still missing:

- external identity provider support
- SSO or OIDC integration
- stronger secret rotation workflows
- mTLS or transport-level hardening guidance
- long-term audit storage and forwarding
- broader authorization rules beyond the current route-based model

Good contribution targets:

- strengthen authz boundaries for operational endpoints
- add richer audit metadata
- design secret rotation runbooks and automation
- introduce external authn/authz integration

Relevant files:

- [src/main/entity/user.js](src/main/entity/user.js)
- [src/main/controller/security/authentication-controller.js](src/main/controller/security/authentication-controller.js)
- [src/main/service/authorization-service.js](src/main/service/authorization-service.js)
- [src/main/service/audit-service.js](src/main/service/audit-service.js)

### 5. Observability and Operations

Current status:

- Prometheus text output exists
- recent traces exist
- alert emission exists
- audit trail exists

What is still missing:

- first-class dashboards
- tracing backend integration
- alert-routing standards
- persistent operational telemetry strategy
- SLO-oriented signals and runbooks

Good contribution targets:

- add dashboard examples
- add tracing export integration
- improve metrics coverage and naming consistency
- document alerting and monitoring deployment patterns

Relevant files:

- [src/main/service/observability-service.js](src/main/service/observability-service.js)
- [src/main/service/alert-service.js](src/main/service/alert-service.js)
- [src/main/config/actuator/actuator-config.js](src/main/config/actuator/actuator-config.js)

### 6. UI and Frontend Tooling

Current status:

- Editable UI source is back under `client/`.
- The dashboard exposes overview, registry, config, audit, alerts, traces, and Prometheus views.

What is still missing:

- frontend test automation
- build pipeline discipline
- accessibility and responsive validation
- stronger UX around RBAC and error states
- packaging strategy if the UI becomes more complex

Good contribution targets:

- add frontend tests
- improve layout, accessibility, and mobile behavior
- add better loading/error/empty states
- make role-specific UI behavior clearer

Relevant files:

- [client/index.html](client/index.html)
- [client/app.js](client/app.js)
- [client/styles.css](client/styles.css)

### 7. SDK and Release Engineering

Current status:

- Java, Node.js, Python, and Go SDKs exist.
- GitHub Actions publish workflows exist.
- Helm and container publishing workflows exist.

What is still missing:

- stronger semantic versioning discipline
- changelog automation
- first fully polished public release flow across all artifacts
- better retry/backoff helpers in SDKs
- more examples and integration guidance

Good contribution targets:

- align server, chart, and SDK versioning
- improve client ergonomics
- add more examples for each supported language
- document release management clearly

Relevant files:

- [client-sdk/README.md](client-sdk/README.md)
- [.github/workflows/publish-node-sdk.yml](.github/workflows/publish-node-sdk.yml)
- [.github/workflows/publish-java-sdk.yml](.github/workflows/publish-java-sdk.yml)
- [.github/workflows/publish-python-sdk.yml](.github/workflows/publish-python-sdk.yml)
- [.github/workflows/publish-helm-chart.yml](.github/workflows/publish-helm-chart.yml)
- [.github/workflows/publish-container.yml](.github/workflows/publish-container.yml)

## Required Quality Bar

Before you consider a change done:

- tests pass locally for the affected area
- docs are updated
- API spec is updated when needed
- Helm docs are updated when chart behavior changes
- SDK docs are updated when client behavior changes
- no generated noise is left in tracked files such as logs

## PR Checklist

- Code change is scoped and intentional
- Tests added or updated
- `README.md` updated if the project surface changed
- `docs/` updated if the user or operator experience changed
- `api-specs/swagger.yaml` updated if the HTTP contract changed
- Helm docs updated if deployment behavior changed
- Relevant SDK README updated if client usage changed

## Questions Worth Asking Before You Build

- Is this a local-mode feature, a Redis-mode feature, or both?
- Does this change need leadership awareness?
- Does this change affect the public API or SDK behavior?
- Does this change alter deployment, operations, or observability?
- What should a contributor update in the docs before this lands?
