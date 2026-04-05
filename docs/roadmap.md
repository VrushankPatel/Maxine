# Maxine Roadmap

## Current State

Maxine currently works as a single-process Node.js registry and discovery server with:

- In-memory service registration, timeout-based eviction, and local registry-state restart recovery
- Redirect-based discovery with `RR`, `CH`, and `RH` selection strategies
- Runtime config mutation through admin APIs
- Basic JWT-protected admin endpoints
- A compiled dashboard UI bundle checked into `client/`

## Highest-Priority Gaps

### Architecture and runtime

- The registry is single-node and becomes a control-plane single point of failure.
- Discovery is redirect-based rather than request-forwarding proxying, so upstream semantics are limited.
- Health is inferred only from heartbeats. There is no active liveness or readiness verification.

### Security and operations

- Admin auth now supports env-backed or file-backed credentials, but it still needs stronger secret management and rotation controls.
- JWT stability depends on setting `MAXINE_JWT_SECRET` outside of dev.
- Observability is partial: there are logs and actuator endpoints, but no metrics export, tracing, or audit trail.

### UI

- The repository only contains the compiled frontend build.
- The editable UI source tree is currently missing, which blocks meaningful refactors and reliable bug fixes.

### SDKs and releases

- Initial Java, Node.js, Python, and Go SDKs now exist in-repo and target the current Maxine API.
- Artifactory publication workflows now exist for the Node, Java, and Python SDK lines.
- Semantic versioning, changelog generation, and release publishing are not automated.

## Delivery Plan

### Phase 1: Stabilize the core server

- Externalize secrets and admin credentials cleanly.
- Separate app construction from process startup everywhere.
- Tighten request validation and error handling.
- Add tests around startup, discovery redirects, config mutation, and registry expiration.

### Phase 2: Harden the registry model

- Strengthen the current file-backed registry recovery and add durable/shared persistence options.
- Add upstream health-checking and stale-node cleanup beyond passive timeouts.
- Revisit weighted-node modeling so load-balancing and observability stay accurate.
- Design for HA or clustered Maxine instances.

### Phase 3: Recover and improve the UI

- Restore the frontend source or rebuild the dashboard from source control.
- Align the UI with current APIs and add real registry, config, and logs workflows.
- Add frontend build/test pipelines instead of shipping only compiled artifacts.

### Phase 4: Ship official client SDKs

Java SDK:
- Spring Boot starter with `application.properties` auto-registration and heartbeat lifecycle
- Discovery helper with retry/backoff support
- Auth/config helpers where appropriate
- Public release channels and version alignment with the server

Node.js SDK:
- npm package with TypeScript types
- Heartbeat scheduler and deregistration helpers
- Discovery client with fetch/axios integration
- Public release automation beyond internal Artifactory publishing

Python SDK:
- Publishable package metadata and release automation
- Retry/backoff helpers and optional async client support
- Heartbeat lifecycle examples for FastAPI, Flask, and Django

Go SDK:
- Stable module import/versioning strategy
- Context-aware request variants and retry helpers
- Examples for service startup/shutdown integration

### Phase 5: Release engineering and platform work

- Automate tagging, changelog generation, and package publishing
- Add container publishing and deployment examples
- Decide whether performance reports should be published to GitHub Pages, Releases, or another public artifact store
- Keep `README`, `docs/`, and `api-specs/swagger.yaml` updated as first-class release outputs
