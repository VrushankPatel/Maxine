# Maxine - Lightning Fast Service Registry

A minimal, high-performance service discovery and registry for microservices.

## Features

- **Lightning Fast**: In-memory storage with O(1) lookups
- **Simple API**: Register, discover, and heartbeat services
- **Automatic Cleanup**: Removes expired services with efficient periodic cleanup (every 30 seconds in lightning mode)
- **Load Balancing**: Round-robin, weighted round-robin, least-connections, random for even load distribution
- **Service Tags**: Filter services by tags for fine-grained discovery
- **Service Versioning**: Support for version-based service discovery
- **Environment Support**: Filter services by environment (dev, staging, prod)
- **Canary Deployments**: Support for gradual traffic shifting to new versions
- **Blue-Green Deployments**: Support for instant traffic switching between versions
- **Key-Value Store**: Simple in-memory KV store for configuration and metadata
- **Maintenance Mode**: Temporarily exclude service nodes from discovery without deregistration
- **Service Aliases**: Allow services to be discoverable under multiple names
- **Minimal Dependencies**: Only essential packages for maximum performance
- **Lightning Mode**: Dedicated minimal mode for ultimate speed with federation, tracing, and dependency mapping
- **Multiple Protocols**: HTTP, UDP, and TCP support for flexible and fast communication
- **Federation**: Connect multiple Maxine registries for distributed service discovery
- **Tracing**: Basic distributed tracing support for observability
 - **Dependency Mapping**: Track service dependencies and impact analysis
 - **Access Control Lists (ACLs)**: Control access to services with allow/deny lists
 - **Service Intentions**: Define communication policies between services
 - **Blacklists**: Temporarily block services from discovery

## Quick Start

```bash
npm install
npm start
```

## Modes

- **Lightning Mode** (default): Ultra-fast, minimal features. Uses root-level API endpoints like `/register`, `/discover`.
- **Full Mode**: Comprehensive features with management UI, security, metrics, etc. Uses `/api/*` endpoints.

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
  "metadata": {"version": "1.0"},
  "tags": ["web", "api"],
  "version": "1.0",
  "environment": "prod"
}
```

##### Discover a Service
```http
GET /discover?serviceName=my-service&tags=web,api&version=1.0&environment=prod
```
Filtering by tags, version, environment is supported for fine-grained discovery.

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
  "serviceName": "my-service",
  "nodeName": "localhost:3000"
}
```

##### List All Services
```http
GET /servers
```

##### Weighted Discovery
```http
GET /discover/weighted?serviceName=my-service
```

##### Least Connections Discovery
```http
GET /discover/least-connections?serviceName=my-service
```

##### Set Canary Deployment (Full Mode Only)
```http
POST /canary/set
Content-Type: application/json

{
  "serviceName": "my-service",
  "percentage": 10,
  "canaryNodes": ["node-1", "node-2"]
}
```

##### Set Blue-Green Deployment
```http
POST /api/maxine/serviceops/blue-green/set
Content-Type: application/json

{
  "serviceName": "my-service",
  "blueNodes": ["node-1", "node-2"],
  "greenNodes": ["node-3", "node-4"],
  "activeColor": "blue"
}
```

##### Set Service Alias
```http
POST /alias/set
Content-Type: application/json

{
  "alias": "my-alias",
  "serviceName": "my-service"
}
```

##### Get Service Alias
```http
GET /alias/get?alias=my-alias
```

##### Set Maintenance Mode
```http
POST /maintenance/set
Content-Type: application/json

{
  "nodeName": "localhost:3000",
  "inMaintenance": true
}
```

##### Set KV
```http
POST /kv/set
Content-Type: application/json

{
  "key": "my-key",
  "value": "my-value"
}
```

 ##### Get KV
```http
GET /kv/get?key=my-key
```

 ##### Set ACL
```http
POST /acl/set
Content-Type: application/json

{
  "serviceName": "my-service",
  "allow": ["client1", "client2"],
  "deny": ["client3"]
}
```

 ##### Get ACL
```http
GET /acl/get?serviceName=my-service
```

 ##### Set Intention
```http
POST /intention/set
Content-Type: application/json

{
  "source": "service-a",
  "destination": "service-b",
  "action": "allow"
}
```

 ##### Get Intention
```http
GET /intention/get?source=service-a&destination=service-b
```

 ##### Add to Blacklist
```http
POST /blacklist/add
Content-Type: application/json

{
  "serviceName": "bad-service"
}
```

 ##### Remove from Blacklist
```http
DELETE /blacklist/remove
Content-Type: application/json

{
  "serviceName": "bad-service"
}
```

 ##### Check Blacklist
```http
GET /blacklist/check?serviceName=bad-service
```

 ##### Health Check
```http
GET /health
```

##### Metrics
```http
GET /metrics
```

#### UDP API (Port 8081)

For ultra-fast communication, use UDP for discovery and heartbeat. Enabled by default in lightning mode for maximum speed.

##### Discover a Service
Send: `discover my-service`
Receive: `localhost:3000 node-x-10` or `not found`

##### Heartbeat
Send: `heartbeat my-service:localhost:3000`
Receive: `ok` or `error`

#### TCP API (Port 8082)

For reliable fast communication, use TCP for discovery and heartbeat. Enabled by default in lightning mode for maximum speed.

##### Discover a Service
Send: `discover my-service`
Receive: `localhost:3000 node-x-10\n` or `not found\n`

##### Heartbeat
Send: `heartbeat my-service:localhost:3000`
Receive: `ok\n` or `error\n`

## Architecture

Maxine maintains an in-memory registry of services and their instances. Services register with heartbeats, and expired services are automatically cleaned up. Discovery returns a random healthy instance for load balancing.

## Performance

    - **Lightning Mode**: Ultra-fast response times using raw Node.js HTTP server for zero middleware overhead, O(1) lookups using optimized in-memory data structures with strategy-based load balancing, pre-allocated buffer responses, optimized GET routes with minimal parsing overhead, simplified heartbeat with periodic cleanup every 30 seconds, disabled circuit breaker for maximum speed, fast LCG PRNG for random selection, optimized least-connections balancing with efficient min-finding, dedicated lightweight registry for minimal overhead, healthyNodes as Set for O(1) additions/removals, precomputed min connection and response time nodes for O(1) lookups, improved weighted load balancing, 15-second discovery cache TTL for better freshness, service versioning and environment filtering enabled with optimized Set-based operations, federation support, tracing, dependency mapping, precompiled regex for UDP/TCP parsing, async I/O for persistence, clustering disabled for in-memory consistency
- **Full Mode**: Comprehensive features with optimized caching, async operations, and JWT authentication
- Minimal memory footprint with lazy loading and conditional initialization
- Automatic cleanup prevents memory leaks with efficient periodic sweeps
- Conditional loading of features for optimal performance
- Rate limiting prevents abuse while maintaining high throughput
- Optimized cleanup algorithm using reverse maps for O(1) node removal
- Load test results: 5000 iterations with 50 concurrent users, sub-millisecond average response time, 100% success rate
- Load test target: 95th percentile < 10ms for 50 concurrent users
- Optimized heartbeat and discovery logic for reduced overhead
- **UDP/TCP Protocols**: Available in lightning mode for even faster communication with optimized parsing, enabled by default in lightning mode for faster communication
 - **Advanced Load Balancing**: Round-robin, least-connections, LRT, weighted round-robin, random, hash-based, power-of-two-choices, adaptive, sticky-round-robin, consistent-hash (blue-green and canary supported)
 - **Service Governance**: ACLs, Intentions, and Blacklists for access control and policy enforcement
 - **Optimized Filtering**: Set-based intersection for tag filtering, reducing discovery time
 - **Consistent Hashing**: Using hashring library for stable load distribution

## License

MIT