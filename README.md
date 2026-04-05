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

Maxine is a Node.js service registry and discovery server for microservice-style systems. It accepts heartbeat-style registrations over HTTP, stores active service nodes in memory, snapshots them to disk for restart recovery, and resolves a service name to a concrete upstream node by acting as a redirecting reverse-proxy entry point.

Today the project ships with:

- In-memory service registration and timeout-based eviction
- Three node-selection strategies: round robin, consistent hashing, and rendezvous hashing
- Auth-protected admin endpoints for config and logs
- Actuator-style health/info/metrics endpoints
- A bundled static dashboard UI in `client/`

## Current Implementation

### Service registration

- `POST /api/maxine/serviceops/register` accepts a service heartbeat payload.
- Registration is stored in memory under `serviceName` and mirrored to a local state file for restart recovery.
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
| `MAXINE_REGISTRY_PERSISTENCE` | env var | `true` | Set to `false` to disable file-backed registry snapshots |
| `MAXINE_REGISTRY_STATE_FILE` | env var | `data/registry-state.json` | Local file used to restore active registrations after restart |
| `MAXINE_JWT_SECRET` | env var | unset | Strongly recommended in non-dev environments so JWTs remain valid across restarts |
| `MAXINE_PERFORMANCE_REPORT_URL` | env var | unset | Public URL consumed by `GET /api/actuator/performance` |

## CI/CD

CircleCI has been removed from this repository. GitHub Actions is now the source of truth:

- `.github/workflows/node.js.yml` runs the automated test suite on Node.js `20.x` and `22.x`
- `.github/workflows/node.js.yml` also builds the Java SDK modules and validates the Python and Go SDKs
- `.github/workflows/codeql.yml` runs CodeQL analysis
- `.github/workflows/load-test.yml` provides a manual load-test workflow and uploads the k6 HTML report as a GitHub Actions artifact
- `.github/workflows/publish-node-sdk.yml` publishes the Node SDK to Artifactory using `MAXINE_NPM_REGISTRY_URL` and `ARTIFACTORY_NPM_TOKEN`
- `.github/workflows/publish-java-sdk.yml` deploys the Java SDK modules to Artifactory using `ARTIFACTORY_MAVEN_RELEASE_URL`, `ARTIFACTORY_USERNAME`, and `ARTIFACTORY_PASSWORD`
- `.github/workflows/publish-python-sdk.yml` publishes the Python SDK to Artifactory using `ARTIFACTORY_PYPI_REPOSITORY_URL`, `ARTIFACTORY_USERNAME`, and `ARTIFACTORY_PASSWORD`

## SDKs

The repository now contains actively maintained SDK starters for the current server API:

- Node.js SDK: `client-sdk/`
- Java HTTP client: `client-sdk/java/maxine-client/`
- Java Spring Boot starter: `client-sdk/java/maxine-spring-boot-starter/`
- Python client: `client-sdk/python/`
- Go client: `client-sdk/go/`

These are intentionally narrower than the old multi-language experiments in git history and are aligned to the endpoints that exist in this codebase today. The Spring Boot starter reads `application.properties` / `application.yml`, derives service metadata from the running app, and starts the Maxine heartbeat automatically.

### Node.js usage

```js
const { MaxineClient } = require('./client-sdk');

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

```properties
spring.application.name=orders-service
server.port=8081

maxine.client.base-url=http://localhost:8080
maxine.client.time-out=10
maxine.client.heartbeat-interval=5s
maxine.client.weight=1
```

With `com.maxine:maxine-spring-boot-starter:1.0.0` on the classpath, that is enough to auto-register the service and keep heartbeats running.

### Python usage

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
- Roadmap: [docs/roadmap.md](docs/roadmap.md)

## Known Gaps

- Registry state is now restored from a local file, but it is still single-node and not durable across shared storage or clustered deployments.
- Maxine is still a single-node control plane and therefore a single point of failure.
- Registry membership is heartbeat-driven only. There is no active upstream health-checking.
- The admin model is better than before but still needs stronger secret storage, rotation, and auditability.
- The UI source is missing from the repo, which blocks safe iterative frontend work.
- Public release/versioning policy is still missing even though Artifactory publish workflows now exist for the Node, Java, and Python SDKs and Go module packaging is now present in-repo.

## Implementation Roadmap

The active roadmap is tracked in [docs/roadmap.md](docs/roadmap.md). The next major phases are:

1. Harden the runtime: persistent secrets, safer auth, better startup/config boundaries, and registry lifecycle fixes.
2. Improve the registry itself: stronger durability, health-aware eviction, better proxy semantics, and multi-node operation.
3. Recover or rebuild the frontend source so the UI can evolve safely.
4. Expand official client SDKs for Java, Node.js, Python, and Go with richer retry/backoff and release versioning.
5. Add semantic versioning, changelog generation, and public package distribution beyond Artifactory.

## License

MIT License. See [LICENSE](LICENSE).
