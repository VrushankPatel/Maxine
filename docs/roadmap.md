# Maxine Roadmap

## Current State

Maxine currently works as a single-process Node.js registry and discovery server with:

- In-memory service registration, timeout-based eviction, and local registry-state restart recovery
- Redirect-based discovery with `RR`, `CH`, and `RH` selection strategies
- Runtime config mutation through admin APIs
- Basic JWT-protected admin endpoints
- A compiled dashboard UI bundle checked into `client/`
- A Docker image definition plus a single-replica Helm chart for Kubernetes installs

## Highest-Priority Gaps

### Architecture and runtime

- The registry is single-node and becomes a control-plane single point of failure.
- Discovery is redirect-based rather than request-forwarding proxying, so upstream semantics are limited.
- Health is inferred only from heartbeats. There is no active liveness or readiness verification.

### Security and operations

- Admin auth now supports env-backed or file-backed credentials, but it still needs stronger secret management and rotation controls.
- JWT stability depends on setting `MAXINE_JWT_SECRET` outside of dev.
- Observability is partial: there are logs and actuator endpoints, but no metrics export, tracing, or audit trail.
- Kubernetes packaging now exists, but HA-safe operation still needs clustered state and stronger operational primitives than the current chart can provide.

### UI

- The repository only contains the compiled frontend build.
- The editable UI source tree is currently missing, which blocks meaningful refactors and reliable bug fixes.

### SDKs and releases

- Initial Java, Node.js, Python, and Go SDKs now exist in-repo and target the current Maxine API.
- GitHub Actions release workflows now exist for GitHub Packages, PyPI, and Maven Central publication.
- Trusted publisher setup and signed Maven Central release credentials still need to be completed outside the repository settings.
- Semantic versioning, changelog generation, and release publishing are still manual.

### Platform packaging

- A GHCR container publish workflow and a GitHub Pages Helm publish workflow now exist in-repo.
- The first public publish and package-visibility setup still need to be completed in GitHub.
- The chart is intentionally single-replica because Maxine is not yet a clustered control plane.

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

### Phase 4: Harden the platform packaging

- Publish the GHCR runtime image and make public access explicit.
- Publish the Helm repository to GitHub Pages and keep it versioned with the app.
- Add release-tag alignment between the container image, Helm chart, and SDK artifacts.
- Add environment-specific values examples for local, staging, and production-style clusters.

### Phase 5: Ship official client SDKs

Java SDK:
- Spring Boot starter with `application.properties` auto-registration and heartbeat lifecycle
- Discovery helper with retry/backoff support
- Auth/config helpers where appropriate
- Public release channels and version alignment with the server

Node.js SDK:
- GitHub Packages npm package with TypeScript types
- Heartbeat scheduler and deregistration helpers
- Discovery client with fetch/axios integration
- Install/auth guidance and release tagging policy

Python SDK:
- Publishable package metadata and PyPI trusted publishing
- Retry/backoff helpers and optional async client support
- Heartbeat lifecycle examples for FastAPI, Flask, and Django

Go SDK:
- Stable module import/versioning strategy
- Context-aware request variants and retry helpers
- Examples for service startup/shutdown integration

### Phase 6: Release engineering and production hardening

- Automate tagging, changelog generation, and package publishing
- Add container publishing and deployment examples
- Decide whether performance reports should be published to GitHub Pages, Releases, or another public artifact store
- Keep `README`, `docs/`, and `api-specs/swagger.yaml` updated as first-class release outputs
