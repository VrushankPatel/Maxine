<img src="docs/img/logo.png"/>

## Maxine : Service Discovery and Registry for Microservices

<div align=center>
<a target="_blank" href="https://sonarcloud.io/summary/new_code?id=VrushankPatel_Gargantua-Maxine-Server"><img src="https://sonarcloud.io/api/project_badges/measure?project=VrushankPatel_Gargantua-Maxine-Server&metric=alert_status" />
<a target="_blank" href="https://github.com/VrushankPatel/Gargantua-Maxine-Server/actions/workflows/codeql.yml"><img src="https://github.com/VrushankPatel/Gargantua-Maxine-Server/actions/workflows/codeql.yml/badge.svg"/></a>
<a target="_blank" href="https://github.com/VrushankPatel/Maxine-Server/actions/workflows/node.js.yml"><img src="https://github.com/VrushankPatel/Maxine-Server/actions/workflows/node.js.yml/badge.svg?branch=master"/></a>
<a target="_blank" href="https://codecov.io/gh/VrushankPatel/Maxine"><img src="https://codecov.io/gh/VrushankPatel/Maxine/branch/master/graph/badge.svg?token=SONYL0TJKT"/></a>
 <a target="_blank" href="https://app.k6.io/runs/public/23fbf58304af4024aae52f7c3a0c9ea1"><img src="https://img.shields.io/badge/k6 cloud-Performance-blue"/></a>
<a target="_blank" href="https://dl.circleci.com/status-badge/redirect/gh/VrushankPatel/Maxine/tree/master"><img src="https://dl.circleci.com/status-badge/img/gh/VrushankPatel/Maxine/tree/master.svg?style=svg"></a>
<a target="_blank" href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-teal.svg"/></a>
<a target="_blank" href="https://www.javascript.com"><img src="https://img.shields.io/badge/Made%20with-JavaScript-1f425f.svg"/></a>
<a target="_blank" href="https://github.com/VrushankPatel"><img src="https://img.shields.io/badge/maintainer-VrushankPatel-blue"/></a>
<a target="_blank" href="https://app.fossa.com/reports/a83419a2-657c-400c-b3b6-f04c8a032a56"><img src="https://img.shields.io/badge/Fossa-Report-blue"/></a>
<a targget="_blank" href="https://app.fossa.com/projects/git%2Bgithub.com%2FVrushankPatel%2FGargantua-Maxine-Server?ref=badge_shield" alt="FOSSA Status"><img src="https://app.fossa.com/api/projects/git%2Bgithub.com%2FVrushankPatel%2FGargantua-Maxine-Server.svg?type=shield"/></a>
<a target="_blank" href="https://app.swaggerhub.com/apis-docs/VRUSHANKPATEL5/maxine-api_s/2.0.2#/"><img src="https://img.shields.io/badge/API Docs-Swagger-blue"/></a>
</div>
<br/>

## Introduction

Maxine is a Service registry and a discovery server that detects and registers each service and device in the network and works as a true reverse proxy to make each service available by its name. Maxine SRD solves the problem of hardwiring URLs to establish flawless communication between microservices.

Maxine SRD has the ability to locate a network automatically making it so that there is no need for a long configuration setup process. The Service discovery works by services connecting through REST on the network allowing devices or services to connect without any manual intervention.

## How Maxine works

1. Assuming that the Maxine SRD server is up and running and all the services or microservices in the network have MAXINE-CLIENT added as a dependency in it, below are the steps on how Service discovery will work.
2. The Maxine client installed in all the services will start sending the heartbeat (A special request that'll have all the necessary metadata of that service to let the other services connect) to the Maxine SRD.
3. The SRD server will extract the service metadata from that request payload and will save it in the in-memory database (to reduce the latency), The server will also run a thread that'll remove that service metadata after the given timeout in the metadata (If not provided, then default heartbeat timeout will be used). SRD will store the data by keeping the serviceName as the primary key so that by the serviceName, its URL can be discovered.
4. After this, all the services that want to intercommunicate with the service inside its network, It'll connect to that service via the Maxine client, and here, it'll use the serviceName instead of the service URL, and the Maxine API client will pass that request to SRD.
5. SRD will receive the request and will extract the serviceName from it. It'll discover if that service is stored there in the registry, If it is, then it'll proxy the request to that service's URL.
6. If that service name has multiple nodes in the registry, then SRD will distribute the traffic across all the nodes of that service.

Below is a tiny animation that explains how maxine registers all the services in the network by their HEARTBEATs sent by the maxine client.
<br/><br/>
<img src="docs/img/anim/maxine-registry.gif" />
<br/><br/>
Notice that the service 3 doesn't have maxine-client installed so it is not sending the heartbeat and therefore, it can not be registered in the maxine registry.
However, that's not the end of it, the explicit custom client can be developed (based on the API Documentation) to communicate with maxine server.
Once the services are registered, Below is the animation that shows how services intercommunicate by maxine client and via maxine's service discovery.
<br/><br/>
<img src="docs/img/anim/maxine-discovery.gif" />
<br/><br/>
As we can see, maxine SRD is working as a true reverse proxy for each servers, and proxying all the requests to the respective servers by searching for their URLs in registry by using the serviceName as a key.


## What problems does Maxine solve?

* When working with SOA (Service oriented architecture) or microservices, we usually have to establish the inter-service communication by their URL that gets constituted by SSL check, Hostname, port, and path.
* The host and port are not something that'll be the same every time. Based on the availability of ports, we have to achieve a flexible architecture so, we can choose the ports randomly but what about the service communication, how'd the other services know that some service's address is changed?
* That's the issue that Maxine solves. No matter where (on which port) the service is running, as long as the MAXINE-CLIENT is added to it, it'll always be discoverable to the SRD. This centralized service store and retrieval architecture make inter-service communication more reliable and robust.
* Also, based on the service's performance diagnostics (If it's down or not working properly), we can stop its registration to the SRD. The client provides functions that can stop sending the heartbeat to the SRD so that the service can be deregistered.
* Also, If any of the services are hosted on more powerful hardware, then we can make SRD distribute more traffic on that service's nodes than the others. All we have to do is to provide weight property to that service's client. the weight means how much power that service has compared to others. Based on weight property, the SRD will register that service will replications, and traffic will be distributed accordingly.
* Maxine now includes health check capabilities to monitor service availability and persistence to survive restarts.
* Maxine is optimized for high performance with in-memory LRU caching (configurable TTL), debounced file saves, parallel health checks (every 60 seconds), connection pooling, circuit breaker for unhealthy nodes, and efficient load balancing algorithms including Round Robin, Weighted Round Robin, Least Response Time, Consistent Hashing, Rendezvous Hashing, Least Connections, Least Loaded, and Random.
* Security is enhanced with JWT authentication for all registry operations.
* Comprehensive metrics collection provides insights into request counts, latencies, and error rates.
* Clustering support for multi-core CPU utilization.
* Configuration via environment variables for flexible deployment.

## New Features

  * **Performance Optimizations**: In-memory caching for discovery operations with configurable TTL (5min), debounced asynchronous file/Redis saves for persistence, parallel health checks, aggressive connection pooling for proxying (10000 max sockets), and API rate limiting. Discovery cache now intelligently uses IP-based keys only for strategies that require it (CH/RH), eliminating unnecessary cache misses. Optimized data structures using Maps and Sets for O(1) lookups in healthy nodes and response times tracking. Fixed metrics latency recording to accurately measure full request response times. Consistent Hashing now uses the hashring library for O(1) hash lookups. Healthy nodes array is cached to avoid repeated Array.from() calls. Weighted Round Robin implemented properly using expanded node lists based on weights. Increased LRU cache size to 500,000 entries for better performance under high load. High performance mode enabled by default, disabling logging and metrics for discovery endpoints to improve throughput.
* **Circuit Breaker**: Automatically skips unhealthy service nodes during discovery with failure counting and automatic recovery to improve reliability.
 * **Background Health Monitoring**: Continuous health checks every 60 seconds to maintain up-to-date service status without impacting request latency. Supports custom health endpoints via service metadata.
* **Optimized Discovery**: Healthy nodes cache eliminates filtering overhead on each discovery request, ensuring lightning-fast service lookups.
 * **Load Balancing Strategies**: Supports Round Robin (RR), Weighted Round Robin (WRR), Least Response Time (LRT), Consistent Hashing (CH), Rendezvous Hashing (RH), Least Connections (LC) with real connection tracking, Least Loaded (LL), Random selection with health-aware routing, Power of Two Choices (P2), and Adaptive load balancing that combines response time and connection metrics.
* **Security**: JWT-based authentication for registry operations (register, deregister, discover, health, metrics).
 * **Metrics**: Real-time metrics endpoint at `/api/maxine/serviceops/metrics` providing request counts, latencies, and error statistics. Prometheus-compatible metrics at `/api/maxine/serviceops/metrics/prometheus`.
* **Health Checks**: Enhanced parallel health monitoring for service nodes with automatic status updates and persistence across restarts.
* **Service Tagging and Filtering**: Services can be tagged via metadata, and discovery can be filtered by tags using the new `/api/maxine/serviceops/discover/filtered` endpoint.
* **Service Versioning**: Discovery supports version-specific routing via the `version` query parameter, allowing clients to target specific service versions.
* **Non-Proxy Discovery**: Added `/api/maxine/serviceops/discover/info` endpoint to retrieve service node information without proxying, useful for clients that need the address directly.
 * **Service Changes Watch API**: Added `/api/maxine/serviceops/changes` endpoint to poll for real-time registry changes (register, deregister, health status updates) since a given timestamp.
      * **Least Loaded Load Balancing**: New LL strategy that routes requests to the service node with the least active connections.
      * **Clustering Support**: Enable multi-worker clustering for better CPU utilization by setting `CLUSTERING_ENABLED=true`.
      * **Environment Configuration**: All configuration options can now be set via environment variables for easier deployment and management.
      * **Service Regions and Zones**: Support for multi-datacenter deployments with region and zone parameters in service registration and discovery.
      * **Service Configuration Management**: Added endpoints for setting, getting, and deleting service-specific configurations at `/api/maxine/serviceops/config/*`.
      * **Webhook Notifications**: Added webhook support for real-time notifications on service registry changes. Register webhooks via `/api/maxine/serviceops/webhooks/add` and receive POST notifications for register, deregister, and health status changes.
      * **Redis Support**: Added Redis integration for distributed registry storage, enabling multiple Maxine instances to share the same registry data for high availability and scalability.
      * **Service Aliases**: Services can now register with multiple aliases, allowing a single service to be discoverable under different names. Use the `/api/maxine/serviceops/aliases/*` endpoints to manage aliases.
      * **Service Maintenance Mode**: Services can be put into maintenance mode to temporarily exclude them from discovery without deregistering. Use the `/api/maxine/serviceops/maintenance` endpoint to set maintenance mode.
      * **Key-Value Store**: Added key-value store functionality for storing and retrieving arbitrary data. Use the `/api/maxine/serviceops/kv/*` endpoints to set, get, and delete key-value pairs.
      * **Client-side Proxy Mode**: Discovery endpoint supports `proxy=false` query parameter to return service address instead of proxying, allowing clients to handle proxying for better performance and flexibility.
      * **Self-Preservation Mode**: Automatically enters self-preservation mode when more than 85% of services fail health checks, preventing cascade failures by not evicting healthy services.
      * **Service Priority Support**: Services can specify priority in metadata, and load balancing strategies prefer higher priority nodes for better resource allocation.

## Setup for development

### Starting the development server

1. Clone the project in your local dir.
2. Install all the dependencies by `npm i`.
3. (Optional) Configure via environment variables (see Configuration section).
4. Start dev server by `npm run dev` (nodemon).

### Test the maxine and generate the coverage.

1. run `npm test` to run all the tests.
2. To generate the reports, there is a task called genreports, try `npm run genreports` to generate reports.
3. To upload the coverage report to codecov.io, the codecov token is required, set the parameter `>>> CODECOV_TOKEN = {token}` in environment and run `npm run coverage` to upload the coverage to codecov.

### Configuration

Maxine can be configured via environment variables:

- `CLUSTERING_ENABLED`: Enable clustering (default: true)
- `NUM_WORKERS`: Number of worker processes (default: CPU cores)
- `LOG_ASYNC`: Enable async logging (default: true)
- `HEARTBEAT_TIMEOUT`: Heartbeat timeout in seconds (default: 5)
- `LOG_JSON_PRETTIFY`: Prettify JSON logs (default: false)
- `ACTUATOR_ENABLED`: Enable actuator endpoints (default: true)
- `STATUS_MONITOR_ENABLED`: Enable status monitor (default: true)
 - `SERVER_SELECTION_STRATEGY`: Load balancing strategy (RR, WRR, LRT, CH, RH, LC, LL, RANDOM, P2, ADAPTIVE) (default: RR)
- `LOG_FORMAT`: Log format (JSON or PLAIN) (default: JSON)
 - `DISCOVERY_CACHE_TTL`: Discovery cache TTL in ms (default: 300000)
 - `FAILURE_THRESHOLD`: Health check failure threshold (default: 3)
 - `REDIS_ENABLED`: Enable Redis for distributed registry (default: false)
 - `REDIS_HOST`: Redis host (default: localhost)
 - `REDIS_PORT`: Redis port (default: 6379)
 - `REDIS_PASSWORD`: Redis password (default: null)
 - `METRICS_ENABLED`: Enable metrics collection (default: true)
 - `HIGH_PERFORMANCE_MODE`: Disable logging for discovery endpoints to improve performance (default: true)
 - `RATE_LIMIT_MAX`: Maximum requests per IP per window (default: 10000)
 - `RATE_LIMIT_WINDOW_MS`: Rate limit window in milliseconds (default: 900000)
 - `HEALTH_CHECK_INTERVAL`: Health check interval in milliseconds (default: 60000)
 - `HEALTH_CHECK_CONCURRENCY`: Maximum concurrent health checks (default: 1000)

### Run maxine on production.

1. Run command `npm start` to start the application with all the pretests.


Licence
-------
MIT License Copyright (c) 2022 Vrushank Patel

Permission is hereby granted, free
of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice
(including the next paragraph) shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

### Licence scan
<a target="_blank" href="https://app.fossa.com/projects/git%2Bgithub.com%2FVrushankPatel%2FGargantua-Maxine-Server?ref=badge_large"><img src="https://app.fossa.com/api/projects/git%2Bgithub.com%2FVrushankPatel%2FGargantua-Maxine-Server.svg?type=large"/></a>
