# Maxine - Lightning Fast Service Registry

A minimal, high-performance service discovery and registry for microservices.

## Features

- **Lightning Fast**: In-memory storage with O(1) lookups, optimized heartbeat with periodic cleanup, pre-allocated response buffers, fast LCG PRNG for random selection
- **Simple API**: Register, discover, heartbeat, and deregister services with support for service versioning
- **Automatic Cleanup**: Removes expired services with efficient periodic cleanup (every 30 seconds)
- **Load Balancing**: Round-robin, random, weighted-random, least-connections, consistent-hash, ip-hash, geo-aware selection for advanced load balancing
- **Health Checks**: /health endpoint returning service and node counts, active health monitoring for real-time status
- **Advanced Health Checks**: Custom health check endpoints with proactive monitoring, configurable intervals, and health status integration with load balancing decisions
- **Circuit Breakers**: Automatic failure detection and recovery to protect against cascading failures
- **Rate Limiting**: Protect services from excessive requests with configurable limits
- **Access Control Lists (ACLs)**: Fine-grained permissions for service discovery access
- **Service Intentions**: Define allowed communication patterns between services
- **Service Dependencies**: Manage service dependencies with cycle detection and graph visualization
- **Metrics**: Basic /metrics endpoint with request counts, errors, uptime, and basic stats
- **Audit Logging**: Comprehensive logging of all registry operations using Winston, including user actions, system events, and security incidents with log rotation and export capabilities
- **Persistence**: Optional persistence to survive restarts with file-based or Redis storage
- **Minimal Dependencies**: Only essential packages for maximum performance
- **Lightning Mode**: Dedicated mode for ultimate speed with core features: register, heartbeat, deregister, discover with round-robin/random load balancing, health, metrics, OpenTelemetry tracing, audit logging
- **Optimized Parsing**: Fast JSON parsing with error handling
- **Event-Driven**: Real-time events for service changes and notifications via WebSocket and MQTT
- **Federation**: Connect multiple Maxine instances across datacenters for global service discovery (available in Lightning Mode)
- **Multi-Datacenter Support**: Global service discovery with cross-datacenter replication and load balancing
- **Authentication/Authorization**: Optional JWT-based auth for Lightning Mode to secure sensitive operations
- **Configuration Management**: Dynamic configuration updates for services with versioning and event notifications
- **gRPC Support**: High-performance gRPC API for service operations
- **Service Mesh Integration**: Automatic Envoy, Istio, and Linkerd configuration generation for seamless service mesh deployment



## Quick Start

```bash
npm install
npm start
```

Maxine runs in **Lightning Mode** by default for maximum performance with minimal features. For full features, set environment variables to disable lightning mode.

## Persistence

Maxine supports optional persistence to maintain registry state across restarts:

- **File-based**: Saves to `registry.json` in the working directory
- **Redis**: Uses Redis for distributed storage

Enable with `PERSISTENCE_ENABLED=true` and set `PERSISTENCE_TYPE=file` or `PERSISTENCE_TYPE=redis`.

For Redis, configure `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`.

## Federation

Maxine supports federation to connect multiple instances across datacenters for global service discovery, cross-datacenter replication, and load balancing.

Enable with `FEDERATION_ENABLED=true` and configure peers with `FEDERATION_PEERS=http://peer1:8080,http://peer2:8080`.

Additional options: `FEDERATION_TIMEOUT` (default 5000ms).

In Lightning Mode, federated registries are queried automatically if a service is not found locally. Registrations and deregistrations are replicated across peers.

## Authentication (Lightning Mode)

Maxine supports optional JWT-based authentication in Lightning Mode to secure sensitive operations like backup/restore and tracing.

Enable with `AUTH_ENABLED=true` and configure:
- `JWT_SECRET`: Secret key for JWT signing
- `JWT_EXPIRES_IN`: Token expiration (default 1h)
- `ADMIN_USERNAME`: Admin username (default admin)
- `ADMIN_PASSWORD_HASH`: Bcrypt hash of admin password

Sign in via POST /signin to get a token, then include in requests as `Authorization: Bearer <token>`.

## MQTT Integration (Lightning Mode)

Maxine supports optional MQTT integration for publishing real-time events to MQTT brokers.

Enable with `MQTT_ENABLED=true` and configure:
- `MQTT_BROKER`: MQTT broker URL (default mqtt://localhost:1883)
- `MQTT_TOPIC`: Base topic for events (default maxine/registry/events)

Events are published to topics like `maxine/registry/events/service_registered`, `maxine/registry/events/circuit_open`, etc. with QoS 1.

MQTT publishing is now enabled in the broadcast function for real-time event distribution.

## OpenTelemetry Tracing

Maxine supports OpenTelemetry tracing for distributed observability. Traces are automatically generated for key operations like service registration, discovery, and deregistration.

Configure Jaeger exporter with `JAEGER_ENDPOINT` environment variable (default: `http://localhost:14268/api/traces`).

Tracing is enabled by default and provides detailed spans for:
- Service registration/deregistration
- Service discovery with load balancing
- API request handling
- Registry operations

## Modes

- **Ultra-Fast Mode**: Extreme performance with minimal features. Core operations only: register, heartbeat (UDP), deregister, discover. No logging, metrics, auth, WebSocket, MQTT, gRPC. Uses UDP for heartbeats for speed. Set `ULTRA_FAST_MODE=true`.
- **Lightning Mode** (default): Ultra-fast with minimal features for maximum speed. Core operations: register, heartbeat, deregister, discover with round-robin/random/geo-aware load balancing and lightweight caching. Optional JWT auth for sensitive endpoints. Uses root-level API endpoints like `/register`, `/discover`.
- **Full Mode**: Comprehensive features including federation, tracing, ACLs, intentions, service blacklists, management UI, security, metrics, etc. Uses `/api/*` endpoints.

To run in full mode: `LIGHTNING_MODE=false npm start`

## API

### Lightning Mode (Default)

#### HTTP API

##### Register a Service
```http
POST /register
Content-Type: application/json

{
   "serviceName": "my-service",
   "host": "localhost",
   "port": 3000,
   "metadata": {"version": "1.0", "weight": 1, "tags": ["web", "api"], "healthCheck": {"url": "/health", "interval": 30000, "timeout": 5000}}
}
```

Note: `version` in metadata enables service versioning. `weight` in metadata is used for `weighted-random` load balancing (default 1). `tags` in metadata is an array of strings for service tagging and filtering. `healthCheck` in metadata configures proactive health monitoring with `url` (default "/health"), `interval` (default 30000ms), and `timeout` (default 5000ms).

Response:
```json
{
  "nodeId": "my-service:localhost:3000"
}
```

##### Discover a Service
```http
GET /discover?serviceName=my-service&loadBalancing=round-robin&version=1.0&tags=web,api
```

Load balancing options: `round-robin` (default), `random`, `weighted-random`, `least-connections`, `weighted-least-connections`, `consistent-hash`, `ip-hash`, `geo-aware`, `least-response-time`. Use `version` parameter for service versioning. Use `tags` parameter to filter services by tags (comma-separated).

Response: Returns a service instance or 404 if not found.

##### Heartbeat
```http
POST /heartbeat
Content-Type: application/json

{
  "nodeId": "my-service:localhost:3000"
}
```

##### Deregister a Service
```http
DELETE /deregister
Content-Type: application/json

{
   "nodeId": "localhost:3000"
}
```

##### List All Services
```http
GET /servers
```

##### Health Check
```http
GET /health
```
Returns status, services count, nodes count.

##### Metrics
```http
GET /metrics
```
Returns uptime, requests, errors, services, nodes, persistenceEnabled, persistenceType, wsConnections, eventsBroadcasted, cacheHits, cacheMisses.

##### Dashboard
```http
GET /dashboard
```
Returns an advanced HTML dashboard with real-time metrics, charts, service topology, and event streaming for comprehensive monitoring. Features include:
- Real-time stats updates via WebSocket
- Interactive charts for node health and cache performance
- Service and node status visualization
- Recent events feed
- Connection status indicators

##### Dependency Graph
```http
GET /dependency-graph
```
Returns an interactive HTML page visualizing the service dependency graph using D3.js. Features include:
- Force-directed graph layout
- Click on nodes to view dependency impact (dependencies and dependents)
- Cycle detection alerts
- Export to JSON or SVG
- Real-time updates (planned)

##### Heap Dump
```http
GET /heapdump
```
Creates a heap snapshot file for memory profiling (requires heapdump module).

##### Backup Registry
```http
GET /backup
```
Returns the current registry state as JSON (requires persistence enabled).

##### Restore Registry
```http
POST /restore
Content-Type: application/json

{ ... registry data ... }
```
Restores registry from backup data (requires persistence enabled).

##### Start Trace
```http
POST /trace/start
Content-Type: application/json

{
  "id": "trace-123",
  "operation": "discover"
}
```

##### Add Trace Event
```http
POST /trace/event
Content-Type: application/json

{
  "id": "trace-123",
  "event": "node selected"
}
```

##### End Trace
```http
POST /trace/end
Content-Type: application/json

{
  "id": "trace-123"
}
```

##### Get Trace
```http
GET /trace/:id
```
Returns the trace data for the given id.

##### Get Service Versions
```http
GET /versions?serviceName=my-service
```

Response:
```json
{
  "serviceName": "my-service",
  "versions": ["1.0", "2.0", "default"]
}
```

##### Get Anomalies
```http
GET /anomalies
```

Response:
```json
{
  "anomalies": [
    {
      "serviceName": "my-service",
      "type": "high_circuit_failures",
      "value": 15
    }
  ]
}
```

##### Set Traffic Distribution (Canary Deployments)
```http
POST /traffic/set
Content-Type: application/json

{
  "serviceName": "my-service",
  "distribution": {"1.0": 80, "2.0": 20}
}
```

##### Promote Version (Blue-Green Deployment)
```http
POST /version/promote
Content-Type: application/json

{
  "serviceName": "my-service",
  "version": "2.0"
}
```

##### Retire Version
```http
POST /version/retire
Content-Type: application/json

{
  "serviceName": "my-service",
  "version": "1.0"
}
```

##### Shift Traffic Gradually
```http
POST /traffic/shift
Content-Type: application/json

{
  "serviceName": "my-service",
  "fromVersion": "1.0",
  "toVersion": "2.0",
  "percentage": 10
}
```

##### Set Service Config
```http
POST /api/maxine/serviceops/config/set
Content-Type: application/json

{
  "serviceName": "my-service",
  "key": "timeout",
  "value": 5000,
  "namespace": "default",
  "region": "us-east",
  "zone": "zone1"
}
```

##### Get Service Config
```http
GET /api/maxine/serviceops/config/get?serviceName=my-service&key=timeout&namespace=default&region=us-east&zone=zone1
```

##### Get All Service Configs
```http
GET /api/maxine/serviceops/config/all?serviceName=my-service&namespace=default&region=us-east&zone=zone1
```

##### Watch Service Config Changes
```http
GET /api/maxine/serviceops/config/watch?serviceName=my-service&namespace=default&region=us-east&zone=zone1
```
Returns Server-Sent Events for real-time config changes.

##### Delete Service Config
```http
DELETE /api/maxine/serviceops/config/delete
Content-Type: application/json

{
  "serviceName": "my-service",
  "key": "timeout",
  "namespace": "default",
  "region": "us-east",
  "zone": "zone1"
}
```

##### Generate Envoy Config
```http
GET /service-mesh/envoy-config
```
Returns Envoy proxy configuration JSON based on registered services, suitable for service mesh integration.

##### Generate Istio Config
```http
GET /service-mesh/istio-config
```
Returns Istio VirtualService and DestinationRule configurations in JSON format for service mesh deployment.

##### Generate Linkerd Config
```http
GET /service-mesh/linkerd-config
```
Returns Linkerd ServiceProfile configurations in JSON format for service mesh deployment, including retry budgets and route conditions.

##### Get Circuit Breaker State
```http
GET /circuit-breaker/:nodeId
```
Returns the circuit breaker state for the specified node, including state (closed/open/half-open), failure count, last failure timestamp, and next retry timestamp.

##### Get Event History
```http
GET /events?since=<timestamp>&limit=<number>
```
Returns recent events from the event history. Use `since` to get events after a specific timestamp (default 0), and `limit` to limit the number of events returned (default 100).

##### Add Service to Blacklist
```http
POST /blacklist/add
Content-Type: application/json

{
  "serviceName": "bad-service"
}
```

##### Remove Service from Blacklist
```http
DELETE /blacklist/remove
Content-Type: application/json

{
  "serviceName": "bad-service"
}
```

##### Get Blacklist
```http
GET /blacklist
```
Returns the list of blacklisted services.

##### GraphQL API
```http
GET /graphql
POST /graphql
```
Maxine provides a GraphQL API for flexible queries and mutations. The GraphQL playground is available at `/graphql` for testing queries.

**Queries:**
- `services`: Get all registered services
- `service(serviceName: String!)`: Get a specific service
- `discover(serviceName: String!, ip: String, group: String, tags: [String], deployment: String, filter: String)`: Discover a service instance

**Mutations:**
- `register(serviceName: String!, nodeName: String!, address: String!, metadata: String)`: Register a service
- `deregister(serviceName: String!, nodeName: String!)`: Deregister a service

##### Set Service Config
```http
POST /config/set
Content-Type: application/json

{
  "serviceName": "my-service",
  "key": "timeout",
  "value": 5000,
  "metadata": {"description": "Request timeout"}
}
```

##### Get Service Config
```http
GET /config/get?serviceName=my-service&key=timeout
```

##### Get All Service Configs
```http
GET /config/all?serviceName=my-service
```

##### Delete Service Config
```http
DELETE /config/delete?serviceName=my-service&key=timeout
```

##### Record Response Time
```http
POST /record-response-time
Content-Type: application/json

{
  "nodeId": "my-service:localhost:3000",
  "responseTime": 150
}
```
Records the response time for a node to enable predictive load balancing based on historical performance data.

##### Add Service Dependency
```http
POST /api/maxine/serviceops/dependency/add
Content-Type: application/json

{
  "serviceName": "my-service",
  "dependsOn": "dependent-service"
}
```

##### Remove Service Dependency
```http
POST /api/maxine/serviceops/dependency/remove
Content-Type: application/json

{
  "serviceName": "my-service",
  "dependsOn": "dependent-service"
}
```

##### Get Service Dependencies
```http
GET /api/maxine/serviceops/dependency/get?serviceName=my-service
```

Response:
```json
{
  "serviceName": "my-service",
  "dependencies": ["dependent-service"]
}
```

##### Get Service Dependents
```http
GET /api/maxine/serviceops/dependency/dependents?serviceName=my-service
```

Response:
```json
{
  "serviceName": "my-service",
  "dependents": ["dependent-service"]
}
```

##### Get Dependency Graph
```http
GET /api/maxine/serviceops/dependency/graph
```

Response:
```json
{
  "my-service": ["dependent-service"],
  "another-service": ["my-service"]
}
```

##### Detect Circular Dependencies
```http
GET /api/maxine/serviceops/dependency/cycles
```

Response:
```json
{
  "cycles": [["service-a", "service-b", "service-a"]]
}
```

##### Set ACL
```http
POST /api/maxine/serviceops/acl/set
Content-Type: application/json

{
  "serviceName": "my-service",
  "allow": ["service-a", "service-b"],
  "deny": ["service-c"]
}
```

##### Get ACL
```http
GET /api/maxine/serviceops/acl/:serviceName
```

Response:
```json
{
  "allow": ["service-a", "service-b"],
  "deny": ["service-c"]
}
```

##### Set Intention
```http
POST /api/maxine/serviceops/intention/set
Content-Type: application/json

{
  "source": "service-a",
  "destination": "service-b",
  "action": "allow"
}
```

##### Get Intention
```http
GET /api/maxine/serviceops/intention/:source/:destination
```

Response:
```json
{
  "source": "service-a",
  "destination": "service-b",
  "action": "allow"
}
```

##### Add Service Dependency
```http
POST /api/maxine/serviceops/dependency/add
Content-Type: application/json

{
  "serviceName": "my-service",
  "dependsOn": "dependent-service"
}
```

##### Remove Service Dependency
```http
POST /api/maxine/serviceops/dependency/remove
Content-Type: application/json

{
  "serviceName": "my-service",
  "dependsOn": "dependent-service"
}
```

##### Get Service Dependencies
```http
GET /api/maxine/serviceops/dependency/get?serviceName=my-service
```

##### Get Service Dependents
```http
GET /api/maxine/serviceops/dependency/dependents?serviceName=my-service
```

##### Get Dependency Graph
```http
GET /api/maxine/serviceops/dependency/graph
```

##### Detect Circular Dependencies
```http
GET /api/maxine/serviceops/dependency/cycles
```

##### Proxy to Service
```http
GET /proxy/:serviceName/:path
```
Proxies requests to a discovered service instance. For example, `/proxy/my-service/health` will proxy to the health endpoint of a random instance of `my-service`.

##### Sign In (Authentication)
```http
POST /signin
Content-Type: application/json

{
  "username": "admin",
  "password": "yourpassword"
}
```

Response:
```json
{
  "token": "jwt-token-here"
}
```

Use the token in Authorization header: `Bearer <token>` for protected endpoints like /backup, /restore, /trace/*.

##### Refresh Token
```http
POST /refresh-token
Content-Type: application/json

{
  "token": "current-jwt-token"
}
```

Response:
```json
{
  "token": "new-jwt-token"
}
```

#### gRPC API

Maxine supports gRPC for high-performance service registration and discovery.

Default gRPC port: 50051

Available methods:
- Register: Register a service instance
- Discover: Discover a service instance with load balancing
- Heartbeat: Send heartbeat for a service instance
- Deregister: Deregister a service instance
- WatchServices: Stream service updates (basic implementation)

Client SDKs can be generated from `api-specs/maxine.proto`.

#### WebSocket API

Maxine supports real-time event streaming via WebSocket for monitoring service changes.

##### Connect to WebSocket
```
ws://localhost:8080
```

##### Authentication

If authentication is enabled, clients must authenticate by sending an auth message with JWT token:

```json
{
  "auth": "jwt-token-here"
}
```

Upon successful authentication, the server responds with `{"type": "authenticated", "user": {...}}`. If authentication fails, the connection is closed.

Role-based access: Certain subscriptions may require specific roles (e.g., admin for admin events).

##### Subscription and Filtering

Clients can subscribe to specific events by sending a JSON message:

```json
{
  "subscribe": {
    "event": "service_registered",
    "serviceName": "my-service"
  }
}
```

Supported filter criteria:
- `event`: Filter by event type (e.g., "service_registered", "circuit_open")
- `serviceName`: Filter by service name
- `nodeId`: Filter by node ID

To unsubscribe:

```json
{
  "unsubscribe": true
}
```

To refresh token:

```json
{
  "refresh_token": true
}
```

Response: `{"type": "token_refreshed", "token": "new-token"}`

If no filter is set, all events are received.

##### Events

The server broadcasts the following events as JSON messages:

- `service_registered`: When a new service instance is registered
  ```json
  {
    "event": "service_registered",
    "data": {
      "serviceName": "my-service",
      "nodeId": "my-service:localhost:3000"
    },
    "timestamp": 1640995200000
  }
  ```

- `service_deregistered`: When a service instance is deregistered
  ```json
  {
    "event": "service_deregistered",
    "data": {
      "nodeId": "my-service:localhost:3000"
    },
    "timestamp": 1640995200000
  }
  ```

- `service_heartbeat`: When a service instance sends a heartbeat
  ```json
  {
    "event": "service_heartbeat",
    "data": {
      "nodeId": "my-service:localhost:3000"
    },
    "timestamp": 1640995200000
  }
  ```

- `service_unhealthy`: When a service instance is removed due to expired heartbeat
  ```json
  {
    "event": "service_unhealthy",
    "data": {
      "nodeId": "my-service:localhost:3000"
    },
    "timestamp": 1640995200000
  }
  ```

- `config_changed`: When a service configuration is updated
  ```json
  {
    "event": "config_changed",
    "data": {
      "serviceName": "my-service",
      "key": "timeout",
      "value": 5000,
      "namespace": "default",
      "region": "us-east",
      "zone": "zone1"
    },
    "timestamp": 1640995200000
  }
  ```

- `config_deleted`: When a service configuration is deleted
  ```json
  {
    "event": "config_deleted",
    "data": {
      "serviceName": "my-service",
      "key": "timeout",
      "namespace": "default",
      "region": "us-east",
      "zone": "zone1"
    },
    "timestamp": 1640995200000
  }
  ```





### Full Mode API

Full Mode provides additional endpoints for advanced features like federation, tracing, ACLs, intentions, and service blacklists. These are available under `/api/maxine/serviceops/`.

##### Add Federated Registry
```http
POST /api/maxine/serviceops/federation/add
Content-Type: application/json

{
  "name": "remote-registry",
  "url": "http://remote-maxine:8080"
}
```

##### Remove Federated Registry
```http
POST /api/maxine/serviceops/federation/remove
Content-Type: application/json

{
  "name": "remote-registry"
}
```

##### Get Federated Registries
```http
GET /api/maxine/serviceops/federation
```

##### Start Trace
```http
POST /api/maxine/serviceops/trace/start
Content-Type: application/json

{
  "operation": "discover",
  "id": "trace-123"
}
```

##### Add Trace Event
```http
POST /api/maxine/serviceops/trace/event
Content-Type: application/json

{
  "id": "trace-123",
  "event": "node selected"
}
```

##### End Trace
```http
POST /api/maxine/serviceops/trace/end
Content-Type: application/json

{
  "id": "trace-123"
}
```

##### Get Trace
```http
GET /api/maxine/serviceops/trace/:id
```

##### Set ACL
```http
POST /api/maxine/serviceops/acl/set
Content-Type: application/json

{
  "serviceName": "my-service",
  "allow": ["service-a", "service-b"],
  "deny": ["service-c"]
}
```

##### Get ACL
```http
GET /api/maxine/serviceops/acl/:serviceName
```

##### Set Intention
```http
POST /api/maxine/serviceops/intention/set
Content-Type: application/json

{
  "source": "service-a",
  "destination": "service-b",
  "action": "allow"
}
```

##### Get Intention
```http
GET /api/maxine/serviceops/intention/:source/:destination
```

##### Add Service to Blacklist
```http
POST /api/maxine/serviceops/blacklist/service/add
Content-Type: application/json

{
  "serviceName": "bad-service"
}
```

##### Remove Service from Blacklist
```http
POST /api/maxine/serviceops/blacklist/service/remove
Content-Type: application/json

{
  "serviceName": "bad-service"
}
```

##### Check if Service is Blacklisted
```http
GET /api/maxine/serviceops/blacklist/service/:serviceName
```

## Client SDKs

Maxine provides client SDKs for easy integration:

- **Python**: Supports both Full Mode and Lightning Mode APIs, including WebSocket for real-time events
- **Go**: Full Mode API support
- **Java**: Full Mode API support
- **C#**: Full Mode API support
- **Rust**: Full Mode API support

Client SDKs include caching, automatic retries, and support for all discovery strategies.

## Architecture

Maxine maintains an in-memory registry of services and their instances. Services register with heartbeats, and expired services are automatically cleaned up. Discovery returns a healthy instance using various load balancing strategies.

## Performance

- **Lightning Mode**: Ultra-fast response times using raw Node.js HTTP server, O(1) lookups using optimized in-memory data structures with lightweight LRU caching (10k entries, 30s TTL), pre-allocated buffer responses, fast LCG PRNG for random selection, advanced load balancing strategies (round-robin, random, weighted-random, least-connections, consistent-hash, ip-hash, geo-aware), optimized request handling without deferred execution for minimal latency, stripped-down registry with only core features for minimal overhead
- **Full Mode**: Comprehensive features with optimized caching, async operations, and JWT authentication
- Minimal memory footprint with efficient data structures
- Automatic cleanup prevents memory leaks with periodic sweeps (every 30 seconds)
- Optimized routing: O(1) Map-based HTTP routing for ultra-fast request handling
- Optimized heartbeat and discovery logic with parallel operations and async I/O
- Active health checks for proactive service monitoring
- Event-driven notifications for real-time updates
   - Load test results: 5,000 requests with 50 concurrent users in ~0.1s, average response time 1.06ms, 95th percentile 1.95ms, 100% success rate
   - Load test target: 95th percentile < 10ms for 50 concurrent users (achieved)
   - Recent optimizations: Fixed WebSocket event broadcasting, added missing cleanup method for expired services, improved error handling in lightning mode, disabled synchronous logging in request handlers to prevent I/O bottlenecks

## License

MIT