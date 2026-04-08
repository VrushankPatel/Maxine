# Roadmap

## Current Baseline

Maxine already includes:

- local, shared-file, and Redis-backed registry state modes
- redirect and proxy discovery modes
- weighted distribution with `RR`, `CH`, and `RH`
- Redis lease leadership with fencing tokens
- opt-in active upstream health checks
- RBAC, audit, alerts, traces, and Prometheus-formatted metrics
- editable dashboard source
- GitHub Actions-based CI/CD, GHCR packaging, and Helm publication
- in-repo SDKs for Node.js, Java, Python, and Go

## Highest-Priority Remaining Work

### 1. Distributed Control Plane

- move beyond Redis lease coordination toward stronger clustered semantics
- improve split-brain handling and failover guarantees
- add deeper leadership-aware mutation coverage
- document operational behavior for replica failure and recovery

### 2. Proxy and Health Model

- deepen proxy timeouts, retries, and policy controls
- improve request/response edge-case handling in proxy mode
- add richer upstream readiness semantics beyond the current probe model
- improve recovery behavior after active eviction

### 3. Security and Identity

- add stronger secret lifecycle guidance and automation
- explore external identity integration
- strengthen authorization boundaries and audit retention strategy
- document transport hardening expectations for production use

### 4. Observability and Operations

- add durable monitoring guidance and dashboards
- integrate with a tracing backend
- improve alert routing patterns and operational runbooks
- expand SLO-oriented metrics and signals

### 5. UI and Frontend Tooling

- add frontend tests
- improve accessibility and role-aware workflows
- validate responsive behavior and operational UX
- decide on a longer-term frontend packaging strategy

### 6. SDKs and Release Engineering

- formalize semantic versioning and release notes
- align server, SDK, chart, and container versioning
- improve retry/backoff ergonomics in clients
- complete first polished public release flow across all artifacts

## Delivery Direction

### Near Term

- stabilize the new cluster, proxy, health, and security surfaces
- keep docs, Helm, SDKs, and API specs aligned with runtime behavior
- improve operational guidance for Redis-backed deployments

### Mid Term

- harden production deployment patterns
- improve release engineering and version discipline
- mature the UI and observability story

### Long Term

- decide whether Maxine remains Redis-coordinated or evolves into a stronger clustered control plane
- validate the architecture against real production-style failure modes
