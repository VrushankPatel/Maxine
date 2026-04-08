# API

The canonical API contract lives in:

- [api-specs/swagger.yaml on GitHub](https://github.com/VrushankPatel/Maxine/blob/master/api-specs/swagger.yaml)

The main API families are:

- `POST /api/maxine/signin` for JWT issuance
- `PUT /api/maxine/change-password` for admin password rotation
- `POST /api/maxine/serviceops/register` for heartbeat registration
- `GET /api/maxine/serviceops/discover` for redirect or proxy-based discovery
- `ALL /api/maxine/serviceops/proxy/:serviceName/*` for direct proxy forwarding
- `GET` and `PUT /api/maxine/control/config` for runtime configuration
- `/api/actuator/*` for health, metrics, traces, alerts, audit, cluster state, and Prometheus output

## Authentication Model

- Unauthenticated endpoints:
  - `POST /api/maxine/signin`
  - public actuator basics such as `/api/actuator/health`
- Authenticated operational endpoints:
  - config
  - logs
  - registry snapshot
  - operational actuator endpoints

RBAC roles:

- `viewer`: read-only operational access
- `operator`: runtime operations and config mutation
- `admin`: full access including password rotation

## Embedded OpenAPI Viewer

<swagger-ui src="https://raw.githubusercontent.com/VrushankPatel/Maxine/master/api-specs/swagger.yaml"/>
