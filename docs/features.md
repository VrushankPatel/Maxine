# Features

## Registry and Lifecycle

- Heartbeat-driven service registration through `POST /api/maxine/serviceops/register`
- Timeout-based expiration for inactive nodes
- Local restart recovery from persisted registry snapshots
- Shared coordination through `shared-file` mode
- Redis-backed shared state for multi-replica coordination
- Weighted node support through virtual-node registration
- Re-registration cleanup so stale virtual nodes are removed when weight changes

## Discovery and Routing

- `GET /api/maxine/serviceops/discover` for name-based service resolution
- Redirect mode for lightweight resolution
- Proxy mode for request-forwarding through Maxine
- Direct proxy endpoint at `/api/maxine/serviceops/proxy/:serviceName/*`
- Load-balancing strategies:
  - round robin
  - consistent hashing
  - rendezvous hashing

## Control Plane and High Availability

- Runtime configuration APIs for mutable behavior
- Lease-based leadership in Redis mode
- Fencing-token based leadership state
- Leader-protected control-plane mutation paths
- Helm-driven single-replica and Redis-backed multi-replica deployment modes

## Upstream Health

- Passive removal through heartbeat timeout
- Optional active upstream probing
- Per-registration `healthCheckPath` support
- Automated unhealthy-node eviction after repeated probe failures

## Security and Access Control

- JWT-based authentication
- RBAC roles for viewer, operator, and admin
- Admin password persistence for file-backed local deployments
- JWT secret rotation support through current and previous secrets

## Observability and Operations

- Actuator endpoints for health, info, metrics, and performance report lookup
- Audit trail endpoint
- Alerts endpoint with optional webhook fan-out
- Cluster leadership endpoint
- Recent request traces endpoint
- Upstream probe status endpoint
- Prometheus-formatted metrics export

## UI and Developer Experience

- Editable dashboard source under `client/`
- Registry, config, audit, alerts, traces, and Prometheus views in the UI
- GitHub Actions-based CI/CD
- Container packaging for GHCR
- Helm chart publishing to GitHub Pages
- In-repo SDKs for Node.js, Java, Python, and Go
