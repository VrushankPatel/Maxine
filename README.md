<p align="center">
  <img src="docs/img/logo.png" alt="Maxine logo" />
</p>

## Maxine: Service Registry, Discovery, and Reverse Proxy

<div align="center">
  <a target="_blank" href="https://github.com/VrushankPatel/Maxine/actions/workflows/node.js.yml">
    <img src="https://github.com/VrushankPatel/Maxine/actions/workflows/node.js.yml/badge.svg?branch=master" alt="Maxine CI" />
  </a>
  <a target="_blank" href="https://github.com/VrushankPatel/Maxine/actions/workflows/codeql.yml">
    <img src="https://github.com/VrushankPatel/Maxine/actions/workflows/codeql.yml/badge.svg" alt="CodeQL" />
  </a>
  <a target="_blank" href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-teal.svg" alt="MIT License" />
  </a>
  <a target="_blank" href="api-specs/swagger.yaml">
    <img src="https://img.shields.io/badge/OpenAPI-Swagger-blue" alt="OpenAPI spec" />
  </a>
</div>

## Overview

Maxine is a Node.js service registry and discovery server for microservice-style systems. It accepts heartbeat-style registrations over HTTP, stores active service nodes in memory, can mirror that state to local disk or Redis for restart/shared recovery, and resolves a service name to a concrete upstream node by acting as a redirecting reverse-proxy entry point.

Today the project ships with:

- In-memory service registration and timeout-based eviction
- Local, shared-file, and Redis-backed registry state modes
- Three node-selection strategies: round robin, consistent hashing, and rendezvous hashing
- Auth-protected admin endpoints for config and logs
- Actuator-style health/info/metrics endpoints
- A bundled static dashboard UI in `client/`

## Current Implementation

### Service registration

- `POST /api/maxine/serviceops/register` accepts a service heartbeat payload.
- Registration is stored in memory under `serviceName` and mirrored to either a local state file or a Redis-backed shared snapshot, depending on runtime mode.
- `weight` is implemented by creating multiple virtual nodes in the registry.
- Nodes expire after `timeOut` seconds unless the service re-registers.
- Re-registering a node now replaces its old virtual-node footprint so stale replicas are not left behind when `weight` changes.

### Service discovery

- `GET /api/maxine/serviceops/discover?serviceName=...` finds a node and issues an HTTP redirect.
- Selection strategy is controlled at runtime through `/api/maxine/control/config`.
- Supported strategies are `RR`, `CH`, and `RH`.

### Admin and observability

- JWT-protected endpoints expose current config, logs, and the full registry snapshot.
- Admin credentials can now come from environment variables or a local persisted state file.
- `GET /api/actuator/performance` is optional and only works when `MAXINE_PERFORMANCE_REPORT_URL` points to a public HTML report.
- The checked-in UI is a compiled build artifact. The editable frontend source is not currently present in this repository.

## Local Development

### Start the server

```bash
npm install
npm run dev
```

For a production-style run:

```bash
npm start
```

### Run tests

```bash
npm test
```

To generate coverage reports locally:

```bash
npm run genreports
```

### Run the load test locally

Start Maxine first, then run:

```bash
MAXINE_HOST=http://127.0.0.1:8080 npm run load-test
```

The HTML summary is written to `artifacts/performance-summary.html`.

## Runtime Configuration

| Setting | Type | Default | Notes |
| --- | --- | --- | --- |
| `PORT` | env var | `8080` | HTTP port for Maxine |
| `--port` / `-p` | CLI arg | unset | CLI override for the HTTP port |
| `--env` / `--profile` | CLI arg | `prod` | `dev` enables `/api-spec` and `/shutdown` |
| `MAXINE_ADMIN_USERNAME` | env var | `admin` | Overrides the admin username |
| `MAXINE_ADMIN_PASSWORD` | env var | `admin` | Overrides the admin password |
| `MAXINE_ADMIN_STATE_FILE` | env var | `data/admin-user.json` | Local file used to persist password changes when admin credentials are not managed by env vars |
| `MAXINE_REGISTRY_PERSISTENCE` | env var | `true` | Set to `false` to disable local file-backed registry snapshots; Redis mode ignores this and keeps shared state enabled |
| `MAXINE_REGISTRY_STATE_FILE` | env var | `data/registry-state.json` | Local file used to restore active registrations after restart |
| `MAXINE_REGISTRY_STATE_MODE` | env var | `local` | `local` uses node-local snapshots, `shared-file` re-synchronizes from a shared snapshot file, and `redis` uses Redis for shared state plus distributed mutation locking |
| `MAXINE_REGISTRY_STATE_LOCK_TIMEOUT_MS` | env var | `5000` | Lock timeout used by `shared-file` and Redis-backed mutation paths |
| `MAXINE_REGISTRY_STATE_LOCK_RETRY_MS` | env var | `100` | Retry interval used while waiting for the shared state lock |
| `MAXINE_REGISTRY_REDIS_URL` | env var | unset | Required when `MAXINE_REGISTRY_STATE_MODE=redis` unless the Helm chart injects an embedded Redis URL |
| `MAXINE_REGISTRY_REDIS_KEY_PREFIX` | env var | `maxine:registry` | Redis key prefix used for the shared registry snapshot and lock |
| `MAXINE_REGISTRY_REDIS_CONNECT_TIMEOUT_MS` | env var | `5000` | Redis client connect timeout in milliseconds |
| `MAXINE_JWT_SECRET` | env var | unset | Strongly recommended in non-dev environments so JWTs remain valid across restarts |
| `MAXINE_PERFORMANCE_REPORT_URL` | env var | unset | Public URL consumed by `GET /api/actuator/performance` |

## CI/CD

CircleCI has been removed from this repository. GitHub Actions is now the source of truth:

- `.github/workflows/node.js.yml` runs the automated test suite on Node.js `20.x` and `22.x`
- `.github/workflows/node.js.yml` also builds the Java SDK modules and validates the Python and Go SDKs
- `.github/workflows/node.js.yml` also lints and renders the Helm chart
- `.github/workflows/codeql.yml` runs CodeQL analysis
- `.github/workflows/load-test.yml` provides a manual load-test workflow and uploads the k6 HTML report as a GitHub Actions artifact
- `.github/workflows/publish-container.yml` builds and publishes the Maxine runtime container image to GHCR
- `.github/workflows/publish-helm-chart.yml` packages charts from `charts/` and publishes the Helm repository to GitHub Pages
- `.github/workflows/publish-node-sdk.yml` publishes the Node SDK to GitHub Packages using the repository `GITHUB_TOKEN`
- `.github/workflows/publish-java-sdk.yml` deploys the Java SDK modules to Maven Central using `MAVEN_CENTRAL_USERNAME`, `MAVEN_CENTRAL_PASSWORD`, `MAVEN_GPG_PRIVATE_KEY`, and `MAVEN_GPG_PASSPHRASE`
- `.github/workflows/publish-python-sdk.yml` publishes the Python SDK to PyPI using PyPI trusted publishing
- The Go SDK is released by tagging the repository because Go modules are fetched directly from the VCS path

## Docker and Helm

Maxine now ships with:

- a production-oriented container image definition in `Dockerfile`
- a Helm chart in `charts/maxine`
- a GHCR image publishing workflow
- a GitHub Pages Helm repository publishing workflow
- an optional Redis-backed multi-replica deployment path for Kubernetes

The recommended install path is:

```bash
helm repo add maxine https://vrushankpatel.github.io/Maxine
helm repo update
helm install maxine maxine/maxine --namespace maxine --create-namespace
```

For direct source installs during development:

```bash
helm install maxine ./charts/maxine --namespace maxine --create-namespace
```

For the Redis-backed multi-replica chart path:

```bash
helm install maxine maxine/maxine \
  --namespace maxine \
  --create-namespace \
  --set replicaCount=3 \
  --set maxine.registryStateMode=redis \
  --set embeddedRedis.enabled=true
```

Important chart behavior:

- the chart defaults to `replicaCount=1`
- `/app/data` is persisted by default so registry snapshots survive pod restarts
- `/app/logs` is ephemeral by default
- probes target `GET /api/actuator/health`
- the default image repository is `ghcr.io/vrushankpatel/maxine`
- `shared-file` registry mode is still available for shared-volume coordination, but Redis mode is the first real shared-state option for multi-replica installs
- the chart can run an embedded single-instance Redis or point Maxine at an external Redis URL

Before advertising public installs, publish the container once and make the GHCR package public if GitHub creates it as private on first push.

## SDKs

The repository now contains actively maintained SDK starters for the current server API:

- Node.js SDK: `client-sdk/`
- Java HTTP client: `client-sdk/java/maxine-client/`
- Java Spring Boot starter: `client-sdk/java/maxine-spring-boot-starter/`
- Python client: `client-sdk/python/`
- Go client: `client-sdk/go/`

These are intentionally narrower than the old multi-language experiments in git history and are aligned to the endpoints that exist in this codebase today. The Spring Boot starter reads `application.properties` / `application.yml`, derives service metadata from the running app, and starts the Maxine heartbeat automatically.

### Node.js usage

Install:

```bash
npm config set @vrushankpatel:registry https://npm.pkg.github.com
npm login --scope=@vrushankpatel --auth-type=legacy --registry=https://npm.pkg.github.com
npm install @vrushankpatel/maxine-client
```

```js
const { MaxineClient } = require('@vrushankpatel/maxine-client');

async function main() {
  const client = new MaxineClient({ baseUrl: 'http://localhost:8080' });
  await client.signIn('admin', 'admin');

  const registration = {
    hostName: '127.0.0.1',
    nodeName: 'orders-node',
    serviceName: 'orders-service',
    port: 8081,
    ssl: false,
    timeOut: 10,
    weight: 1
  };

  const heartbeat = client.startHeartbeat(registration, { intervalMs: 5000 });
  const discovery = await client.discoverLocation('orders-service', '/health');
  console.log(discovery.location);

  heartbeat.stop();
}
```

### Java client usage

Dependency:

```xml
<dependency>
    <groupId>io.github.vrushankpatel</groupId>
    <artifactId>maxine-client</artifactId>
    <version>1.0.0</version>
</dependency>
```

```java
import com.maxine.client.MaxineClient;

import java.util.Map;

MaxineClient client = new MaxineClient("http://localhost:8080");
client.signIn("admin", "admin");

Map<String, Object> registration = Map.of(
    "hostName", "127.0.0.1",
    "nodeName", "orders-node",
    "serviceName", "orders-service",
    "port", 8081,
    "ssl", false,
    "timeOut", 10,
    "weight", 1
);

MaxineClient.HeartbeatHandle heartbeat = client.startHeartbeat(registration);
System.out.println(client.discoverLocation("orders-service", "/health").orElse(""));
heartbeat.stop();
```

### Spring Boot starter example

Dependency:

```xml
<dependency>
    <groupId>io.github.vrushankpatel</groupId>
    <artifactId>maxine-spring-boot-starter</artifactId>
    <version>1.0.0</version>
</dependency>
```

```properties
spring.application.name=orders-service
server.port=8081

maxine.client.base-url=http://localhost:8080
maxine.client.time-out=10
maxine.client.heartbeat-interval=5s
maxine.client.weight=1
```

With `io.github.vrushankpatel:maxine-spring-boot-starter:1.0.0` on the classpath, that is enough to auto-register the service and keep heartbeats running.

### Python usage

Install:

```bash
pip install maxine-client
```

```python
from maxine_client import MaxineClient

client = MaxineClient("http://localhost:8080")
client.sign_in("admin", "admin")

registration = {
    "hostName": "127.0.0.1",
    "nodeName": "orders-node",
    "serviceName": "orders-service",
    "port": 8081,
    "ssl": False,
    "timeOut": 10,
    "weight": 1,
}

heartbeat = client.start_heartbeat(registration, interval_seconds=5)
discovery = client.discover_location("orders-service", "/health")
print(discovery["location"])

heartbeat.stop()
```

### Go usage

Install:

```bash
go get github.com/VrushankPatel/Maxine/client-sdk/go@latest
```

```go
package main

import (
    "fmt"
    "log"
    "time"

    maxine "github.com/VrushankPatel/Maxine/client-sdk/go"
)

func main() {
    client := maxine.NewClient("http://localhost:8080")
    if _, err := client.SignIn("admin", "admin"); err != nil {
        log.Fatal(err)
    }

    registration := map[string]any{
        "hostName":    "127.0.0.1",
        "nodeName":    "orders-node",
        "serviceName": "orders-service",
        "port":        8081,
        "ssl":         false,
        "timeOut":     10,
        "weight":      1,
    }

    heartbeat := client.StartHeartbeat(registration, 5*time.Second, true, nil)
    discovery, err := client.DiscoverLocation("orders-service", "/health")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(discovery.Location)
    heartbeat.Stop()
}
```

## API and Documentation

- OpenAPI spec: [api-specs/swagger.yaml](api-specs/swagger.yaml)
- Docs entry: [docs/index.md](docs/index.md)
- Helm guide: [docs/helm.md](docs/helm.md)
- Roadmap: [docs/roadmap.md](docs/roadmap.md)

## Package Publishing Setup

For the public SDK releases:

- GitHub Packages only supports scoped npm packages, so the Node SDK is published as `@vrushankpatel/maxine-client`.
- There is no separate "create package" screen in GitHub Packages. The package is created by the first successful publish to `npm.pkg.github.com`, and GitHub marks npm packages private by default until you change package visibility.
- PyPI does not have a separate "create project" screen for this flow either. The `maxine-client` project is created by the first successful publish, or by configuring a pending trusted publisher first.
- Maven Central should use the GitHub-personal namespace `io.github.vrushankpatel`. A namespace shaped like `io.github.vrushankpatel.maxine` is treated by Sonatype as if `vrushankpatel.maxine` were the GitHub account name, which makes the verification URL invalid.

GitHub repository configuration still required outside the repo:

- PyPI trusted publisher for owner `VrushankPatel`, repository `Maxine`, workflow `publish-python-sdk.yml`
- Repository secrets for Maven Central: `MAVEN_CENTRAL_USERNAME`, `MAVEN_CENTRAL_PASSWORD`, `MAVEN_GPG_PRIVATE_KEY`, `MAVEN_GPG_PASSPHRASE`
- No extra secret is needed for Node publishing because the GitHub Packages workflow uses the repository `GITHUB_TOKEN`

Recommended one-time release setup:

1. Cancel the unverified `io.github.vrushankpatel.maxine` Sonatype namespace request.
2. Add `io.github.vrushankpatel` instead. If Sonatype does not auto-verify it, verify the new key with a temporary public repository under `https://github.com/VrushankPatel/<verification-key>`.
3. Publish `@vrushankpatel/maxine-client` once through GitHub Actions so GitHub Packages creates the package.
4. Configure PyPI trusted publishing for `maxine-client`.
5. Add the Maven Central and GPG secrets to this GitHub repository.

The current publish workflows are manual `workflow_dispatch` jobs so the first public releases can be performed deliberately. The GitHub Packages npm registry still requires consumers to authenticate with GitHub when installing outside Actions. The Go SDK does not need a separate registry account; consumers install it from the module path and version tags.

## Production Readiness

Maxine is better than it was at the start of this cleanup, but it is still not something I would call fully production grade yet.

What is now in place:

- restart recovery for registry state via local disk snapshots
- optional shared-file registry synchronization for shared-volume deployments
- Redis-backed shared registry state with distributed mutation locking
- safer admin/JWT handling than the original code
- multi-language SDKs
- GitHub Actions CI
- container packaging and Helm delivery

What still keeps it from production-grade service-registry status:

- Maxine now has a Redis-backed shared state mode, but it is still not a fully clustered control plane with leader election, fencing, or consensus.
- The registry is still in-memory first inside each pod and is rebuilt from shared state on demand, so there is more coordination latency and less rigor than a purpose-built distributed registry.
- Embedded Redis in the Helm chart is useful for self-contained installs, but serious production setups should still prefer an external managed Redis with backup and failover.
- Service discovery still redirects clients instead of proxying requests, which limits observability, policy enforcement, and failure handling.
- There are no active health checks against registered upstreams beyond heartbeat expiry.
- Security is still basic: single admin user, no RBAC, no external identity provider, no secret-rotation workflow, and no audit trail.
- There is no first-class metrics export, tracing, SLO monitoring, or alerting integration.
- The editable UI source is still missing, which makes frontend fixes and operational UX work risky.
- Release hardening is still incomplete: Maven Central credentials and signing are not finished, and the public package channels still need their first official versioned release cycle.

## Known Gaps

- Redis mode gives Maxine a shared state backend, but there is still no consensus-based clustering or clean split-brain prevention story.
- Shared-file mode remains a coordination fallback, not a production-grade HA design.
- Maxine is still logically a single control plane and therefore a single point of failure at the application layer.
- Registry membership is heartbeat-driven only. There is no active upstream health-checking.
- The admin model is better than before but still needs stronger secret storage, rotation, and auditability.
- The UI source is missing from the repo, which blocks safe iterative frontend work.
- Public release/versioning policy is still missing even though npm, PyPI, and Maven Central workflows now exist and the Go module is installable from the repository path.
- Helm packaging now supports Redis-backed multi-replica installs, but HA-safe Kubernetes operation still needs stronger operational guidance, external dependency monitoring, and failover testing.

## Implementation Roadmap

The active roadmap is tracked in [docs/roadmap.md](docs/roadmap.md). The next major phases are:

1. Harden the runtime: persistent secrets, safer auth, better startup/config boundaries, and registry lifecycle fixes.
2. Improve the registry itself: stronger durability, health-aware eviction, better proxy semantics, and multi-node operation.
3. Recover or rebuild the frontend source so the UI can evolve safely.
4. Harden the platform story: public GHCR image publication, GitHub Pages Helm publication, pinned release tags, and installation guides.
5. Expand official client SDKs for Java, Node.js, Python, and Go with richer retry/backoff and release versioning.
6. Add semantic versioning, changelog generation, and tagged public package distribution.

## License

MIT License. See [LICENSE](LICENSE).
