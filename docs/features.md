# Maxine Features
### Dashboard UI
- Maxine dashboard UI provides a very interactive way to monitor the configuration, logs, SRD info and the SRD's current status like memory occupied, requests per second etc.

<img src="/en/latest/img/maxine-dashboard.png" />
### Service registry
- The service registry is the part of Maxine that register or save the service metadata (Extracted data like serviceName, hostName, nodeName, port, SSL, timeOut, weight, path from heartbeat) in memory to make the retrieval faster.
- Also, the SRD replicates the more weighted services (The service that sends a weight of more than one).
- After registering the Service, the SRD will run a thread asynchronously that'll remove that service from the registry once the timeout exceeds and that Service is not re-registered.
- If the service sends the heartbeat before the timeout passes since it was registered, then the thread that was executed earlier will be suspended and a new thread will start doing the same again.
 - The registry now supports optional disk persistence using registry.json or Redis, allowing services to survive server restarts in lightning mode.
### Service discovery
- The service discovery discovers the service that is registered in the registry.
- When the service discovery receives the request, it extracts the serviceName from the request and discovers the service with that service name.
- Discovery supports version-specific routing via the optional `version` query parameter, allowing clients to target specific service versions (defaults to any version if not specified).
- Service aliases allow services to be discoverable under multiple names, providing flexibility in service naming and migration scenarios.
- Service maintenance mode allows temporary exclusion of service nodes from discovery without deregistration, useful for planned maintenance or upgrades via `/api/maxine/serviceops/maintenance`.
- Service metadata updates allow dynamic changes to service properties (weights, health endpoints, tags) without re-registration via `/api/maxine/serviceops/metadata/update`.
- Traffic splitting for versions allows services to define `trafficSplit` in metadata to route percentages of requests to different versions, enabling canary deployments and gradual rollouts.
- Discovery responses now include health status by default and optional metadata when requested with `?metadata=true` query parameter, providing richer service information for client-side decision making.
- If discovery finds the single service node with that serviceName, then It'll simply redirect that request to that service's URL.
- If there are multiple nodes of the same service in the registry, then discovery has to distribute the traffic across all of them, that's where Maxine's load balancer comes to rescue.
  - Filtered discovery allows routing to services based on tags, enabling environment-specific or feature-specific routing via `/api/maxine/serviceops/discover/filtered?serviceName=<name>&tags=<tag1>,<tag2>`.
  - Service groups listing allows retrieving all services and their healthy nodes filtered by group via `/api/maxine/serviceops/servers/group?group=<group>&namespace=<namespace>`.
### Health checks
- Maxine provides comprehensive health monitoring for registered services with both on-demand, background, active, and push-based checks.
- The health check endpoint `/api/maxine/serviceops/health?serviceName=<name>` performs parallel HTTP requests to all nodes of the specified service and reports their status.
- In lightning mode, the `/health` endpoint provides a simple health check returning service and node counts for quick monitoring.
  - Background health checks are disabled by default for maximum performance; enable with `HEALTH_CHECK_ENABLED=true` to run continuously every 30 seconds to maintain up-to-date service status without impacting request latency.
  - Active health checks proactively ping service nodes on their `/health` endpoint every 30 seconds, automatically updating healthy/unhealthy status and maintaining real-time service availability.
- Push health updates allow services to send their health status directly via `/api/maxine/serviceops/health/push` with JSON payload containing serviceName, nodeName, status ('healthy' or 'unhealthy'), and optional namespace, enabling faster health monitoring without pull-based checks.
- Health status is cached in optimized data structures, enabling circuit breaker functionality with failure counting that automatically skips unhealthy nodes during discovery.
- Circuit breaker includes automatic recovery when services become healthy again, improving overall system reliability and performance.
- Rate limiting protects the registry from excessive requests with configurable limits per IP address.
- Access Control Lists (ACLs) provide fine-grained permissions for service discovery access, allowing administrators to restrict which services can discover others based on allow/deny lists.
- Service Intentions define allowed communication patterns between services, enabling policy-based access control for microservices architectures.
- Health check history is tracked for each service node, accessible via `/api/maxine/serviceops/health/history?serviceName=<name>&nodeName=<node>` to monitor service stability over time.
  - Advanced health checks support custom HTTP methods (GET, POST, etc.) via `healthMethod` in service metadata, custom headers via `healthHeaders` in service metadata, TCP checks via `healthType: 'tcp'`, and script-based checks via `healthType: 'script'` with `healthScript` containing the command to execute.
### Persistence
- Maxine supports optional persistence to maintain registry state across server restarts.
- **File-based persistence**: Saves registry state to `registry.json` in the working directory on every change.
- **Redis persistence**: Uses Redis for distributed persistence across multiple instances.
- Enable with `PERSISTENCE_ENABLED=true` and set `PERSISTENCE_TYPE=file` or `PERSISTENCE_TYPE=redis`.
- Backup and restore endpoints allow exporting/importing registry state as JSON.
- Persistence maintains service registrations, heartbeats, and metadata across restarts.
- Minimal performance impact with asynchronous saves and optimized data structures.

### Metrics
- Maxine provides comprehensive metrics collection for monitoring performance and usage.
  - In lightning mode, the `/metrics` endpoint provides basic metrics including request counts, errors, uptime, and basic stats.
  - The metrics endpoint `/api/maxine/serviceops/metrics` returns real-time statistics including:
    - Total requests, successful requests, failed requests
    - Average latency and recent latency history
    - Per-service request counts
    - Error type breakdowns
  - Prometheus-compatible metrics are available at `/api/maxine/serviceops/metrics/prometheus` for integration with monitoring systems.
   - Cache statistics are available at `/api/maxine/serviceops/cache/stats` showing cache size, max size, TTL, service key count, and hit/miss ratios.
  - Metrics are collected automatically for all discovery operations.
### Service Changes Watch API
- Maxine provides a watch API for real-time monitoring of registry changes.
- The changes endpoint `/api/maxine/serviceops/changes?since=<timestamp>` returns all registry events (register, deregister, health status changes) that occurred after the specified timestamp.
- The Server-Sent Events endpoint `/api/maxine/serviceops/changes/sse?since=<timestamp>` provides real-time streaming of registry changes using SSE, allowing clients to receive updates instantly without polling.
- Event-driven notifications emit events for service registration and deregistration, enabling reactive architectures and real-time monitoring.
- This enables clients to poll for updates or subscribe for real-time notifications to maintain synchronized views of the service registry.
- Changes are tracked for the last 1000 events to balance memory usage with historical visibility.

### Service Dependencies
- Maxine provides a service dependencies API to retrieve the dependency graph for services.
- The dependencies endpoint `/api/maxine/serviceops/dependencies?serviceName=<name>` returns the services that the specified service depends on and the services that depend on it.
- This enables understanding service relationships and impact analysis for changes.
### Security
- Maxine implements JWT-based authentication for all registry operations.
- Role-based access control (RBAC) restricts write operations (register, deregister, config changes) to admin users, while read operations are available to authenticated users.
- Admin user can perform all operations, while regular users can only read service information and metrics.

### Client SDK
- Maxine provides client SDKs for multiple languages for easy integration.
- **JavaScript/Node.js SDK**: Located in `client-sdk/` for Node.js applications.
- **Python SDK**: Located in `client-sdk/python/` for Python applications.
- **Go SDK**: Located in `client-sdk/go/` for Go applications.
- **Java SDK**: Located in `client-sdk/java/` for Java applications.
- **C# SDK**: Located in `client-sdk/csharp/` for C# applications.
- All SDKs support all major operations: register, deregister, discover, health checks, and metrics retrieval.
   - All SDKs support ultra-fast UDP and TCP discovery for zero-latency lookups in addition to HTTP discovery. UDP and TCP are enabled by default in lightning mode.
- JavaScript SDK Example:
  ```javascript
  const MaxineClient = require('./client-sdk');

  const client = new MaxineClient('http://localhost:8080', 'your-jwt-token');

  // Register a service
  await client.register({
    hostName: 'localhost',
    nodeName: 'node-1',
    serviceName: 'my-service',
    port: 3000
  });

  // Discover a service
  const service = await client.discover('my-service');
  ```
- Python SDK Example:
  ```python
  from maxine_client import MaxineClient

  client = MaxineClient('http://localhost:8080')

  # Register a service
  response = client.register_service('my-service', 'http://localhost:3000')
  print(response)

  # Discover a service
  service = client.discover_service('my-service')
  print(service)
  ```
- Java SDK Example:
  ```java
  import com.maxine.MaxineClient;
  import com.maxine.MaxineClient.ServiceNode;

  // Create client
  MaxineClient client = new MaxineClient("http://localhost:8080");

  // Discover service
  ServiceNode node = client.discover("my-service");
  if (node != null) {
      System.out.println("Service address: " + node.getAddress());
      System.out.println("Node name: " + node.getNodeName());
  }

  // Close client
  client.close();
  ```
- C# SDK Example:
  ```csharp
  using Maxine;

  // Create client
  using var client = new MaxineClient("http://localhost:8080");

  // Discover service
  var node = await client.DiscoverAsync("my-service");
  if (node != null)
  {
      Console.WriteLine($"Service address: {node.Address}");
      Console.WriteLine($"Node name: {node.NodeName}");
  }
  ```

### WebSocket Real-time Updates and Discovery
- Maxine supports WebSocket connections for real-time notifications of service registry changes and direct service discovery.
- Connect to `ws://localhost:8080` to receive events for register, deregister, and health status updates.
- Send serviceName messages over WebSocket to receive service discovery responses with address and nodeName.
- Events are sent as JSON messages with type, serviceName, nodeName, data, and timestamp.

### Webhook Notifications
- Maxine supports webhook notifications for real-time alerts on service registry changes.
- Register webhooks via `/api/maxine/serviceops/webhooks/add` with serviceName and URL.
- Receive HTTP POST notifications to the webhook URL for register, deregister, and health status change events.
- Webhooks enable external systems to react immediately to service availability changes without polling.
### gRPC Support
- Maxine supports gRPC for service discovery with low-latency binary protocol.
- Enable with `GRPC_ENABLED=true` and configure `GRPC_PORT` (default 50051).
- Provides gRPC endpoint for discover operations, useful for high-performance microservices.
### Batch Discovery
- Maxine supports batch discovery to retrieve multiple services in a single request.
- Use `/api/maxine/serviceops/discover/batch` with array of service names.
- Reduces network overhead for clients needing multiple service addresses.
### Envoy Configuration Generation
- Maxine can generate Envoy proxy configuration for all registered services.
- Use `/api/maxine/serviceops/envoy/config` to get Envoy config JSON.
- Enables seamless integration with service mesh architectures like Istio.
### Istio ServiceEntry Generation
- Maxine can generate Istio ServiceEntry configurations for all registered services.
- Use `/api/maxine/serviceops/istio/config` to get Istio ServiceEntry YAML/JSON.
- Enables seamless integration with Istio service mesh for traffic management and security.
### Linkerd Service Profile Generation
- Maxine can generate Linkerd Service Profile configurations for all registered services.
- Use `/service-mesh/linkerd-config` to get Linkerd Service Profile JSON.
- Enables seamless integration with Linkerd service mesh for traffic management and security.
### OpenTelemetry Tracing
- Maxine integrates OpenTelemetry for distributed tracing.
- Enable with `TRACING_ENABLED=true` and configure `JAEGER_ENDPOINT`.
- Exports traces to Jaeger for observability in microservices.
### Backup and Restore
- Maxine supports backup and restore of the entire registry state.
- Use `/backup` to export JSON in lightning mode, `/api/maxine/serviceops/backup` in full mode.
- Use `/restore` to import JSON in lightning mode, `/api/maxine/serviceops/restore` in full mode.
- Useful for disaster recovery and migration. CLI commands available.
### etcd Persistence
- Maxine supports etcd for distributed persistence.
- Enable with `ETCD_ENABLED=true` and configure `ETCD_HOST` and `ETCD_PORT`.
- Provides high availability and consistency across instances.
### Kafka Event Streaming
- Maxine integrates Kafka for real-time event streaming of registry changes.
- Enable with `KAFKA_ENABLED=true` and configure `KAFKA_BROKERS`.
- Publishes events to `maxine-registry-events` topic.
### Pulsar Event Streaming
- Maxine integrates Apache Pulsar for real-time event streaming of registry changes.
- Enable with `PULSAR_ENABLED=true` and configure `PULSAR_SERVICE_URL` and `PULSAR_TOPIC`.
- Publishes events to the configured Pulsar topic.
### Consul Integration
- Maxine can import services from HashiCorp Consul.
- Enable with `CONSUL_ENABLED=true` and configure `CONSUL_HOST` and `CONSUL_PORT`.
- Enables migration from Consul-based systems.
### Kubernetes Integration
- Automatic service discovery from Kubernetes clusters.
- Enable with `KUBERNETES_ENABLED=true`.
- Watches K8s services and endpoints.
### Service Governance
- Registration approval workflows.
- Enable with `APPROVAL_REQUIRED=true`.
- Pending services queue with approve/reject endpoints.
### Service Dependency Graph
- Maxine provides service dependency graph endpoint.
- Use `/api/maxine/serviceops/dependency/graph` to get dependencies.
- Automatic dependency detection through call logging: services can report outbound calls via `/record-call` endpoint, enabling auto-detection of service dependencies based on traffic patterns.
### Impact Analysis
- Maxine provides impact analysis for service failures.
- Use `/api/maxine/serviceops/impact/analysis` to list dependent services.
### Service API Specs
- Services can register API specifications (OpenAPI/Swagger).
- Use `/api/maxine/serviceops/api-spec/set` to set, `/api/maxine/serviceops/api-spec/get` to get.
### Web Dashboard
- Simple web dashboard at `/dashboard` for monitoring.
### Kubernetes Integration
- Maxine supports automatic service discovery from Kubernetes clusters for seamless integration with containerized deployments.
- Enable with `KUBERNETES_ENABLED=true` to watch Kubernetes services and endpoints in real-time.
- Automatically registers Kubernetes services as Maxine services, using service namespacing and endpoint IPs/ports.
- Supports dynamic updates when services are added, modified, or removed in the cluster.
- Enables Maxine to act as a service registry for both traditional and Kubernetes-native microservices architectures.
### Kubernetes Ingress Generation
- Maxine can generate Kubernetes Ingress and Service YAML configurations for all registered services.
- Use `/api/maxine/serviceops/kubernetes/ingress` to get Ingress and Service YAML/JSON.
- Enables seamless integration with Kubernetes ingress controllers for traffic routing and load balancing.
### ECS Integration
- Maxine supports automatic service discovery from AWS ECS clusters for seamless integration with containerized deployments.
- Enable with `ECS_ENABLED=true` and configure `AWS_REGION` to poll ECS services and tasks in real-time.
- Automatically registers ECS services as Maxine services, using task IPs and ports.
- Supports dynamic updates when services are deployed, updated, or removed in the cluster.
- Enables Maxine to act as a service registry for both traditional and ECS-native microservices architectures.
### Nomad Integration
- Maxine supports automatic service discovery from HashiCorp Nomad clusters for seamless integration with containerized deployments.
- Enable with `NOMAD_ENABLED=true` and configure `NOMAD_HOST` and `NOMAD_PORT` to poll Nomad jobs and allocations in real-time.
- Automatically registers Nomad services as Maxine services, using allocation IPs and ports.
- Supports dynamic updates when jobs are deployed, updated, or removed in the cluster.
- Enables Maxine to act as a service registry for both traditional and Nomad-native microservices architectures.
### mDNS Service Discovery
- Maxine supports advertising registered services via multicast DNS (mDNS) for local network discovery.
- Enable with `MDNS_ENABLED=true` to advertise services on the local network using Bonjour/ZeroConf protocols.
- Services are advertised as `_<serviceName>._tcp.local` with SRV and TXT records containing service details.
- Enables service discovery in local networks without requiring a central registry, useful for development and IoT environments.
### Service Instance Limits
- Maxine supports configurable limits on the number of instances per service to prevent overload and ensure stability.
- Set `MAX_INSTANCES_PER_SERVICE` environment variable to define the maximum allowed instances (default: 1000).
- Registration requests exceeding the limit are rejected with a warning, maintaining service quality under high load.
- Helps in resource management and prevents cascading failures from excessive service instances.
### Service Health Score
- Maxine calculates health scores for service nodes based on connection load and response times.
- Health score is computed as a score from 0-100, where higher scores indicate healthier nodes with lower load and faster response times.
- Enables monitoring service quality and load distribution optimization.
- Provides quantitative metrics for service health monitoring.

### Service Health Prediction
- Maxine provides predictive health monitoring using time-series analysis of response times.
- Predicts future service health based on historical performance trends.
- Uses linear regression on recent response time data to forecast service degradation.
- API endpoint `/predict-health?serviceName=<name>&window=<ms>` returns predictions with trend analysis.
- Enables proactive scaling and maintenance before services fail.
### Service API Specs
- Maxine supports storing and retrieving API specifications for registered services to enable better service contract management.
- Set API specs (e.g., OpenAPI/Swagger JSON) via `/api/maxine/serviceops/api-spec/set` with serviceName, nodeName, and apiSpec payload.
- Retrieve API specs via `/api/maxine/serviceops/api-spec/get?serviceName=<name>&nodeName=<node>` to access service contracts programmatically.
- API specs are stored per service node and persist across restarts, enabling API documentation and client code generation.
### ACL Policies
- Maxine supports fine-grained access control policies for managing permissions to services.
- Add policies via `/api/maxine/serviceops/acl/add` with name and policy JSON.
- Get policies via `/api/maxine/serviceops/acl/:name`.
- Delete policies via `/api/maxine/serviceops/acl/:name` (admin only).
- List all policies via `/api/maxine/serviceops/acl`.
- Policies enable role-based access control for service operations.
### Key-Value Store
- Maxine includes a distributed key-value store for storing and retrieving arbitrary configuration data or shared state.
- Set key-value pairs via `/api/maxine/serviceops/kv/set` with JSON payload containing key and value.
- Retrieve values via `/api/maxine/serviceops/kv/get?key=<key>` or get all pairs via `/api/maxine/serviceops/kv/all`.
- Delete keys via `/api/maxine/serviceops/kv/delete` with JSON payload containing key.
- Data persists across restarts when using file storage or Redis backend.
### Load Balancing
- If there are multiple nodes of that service available in the registry, then the discovery needs to distribute the load across those nodes.
- Choosing the right server is a very important thing here because if we're using the server-side and server-specific cache, then choosing the wrong node or server might cost us (High latency especially).
- Maxine implements health-aware load balancing, automatically excluding unhealthy nodes from selection.
  - Here, the Maxine discovery comes with eleven server-selection strategies.
    - Round robin: This strategy is very simple, discovery will start forwarding the request to the next healthy server each server in turn and in order. Note that the requests to the same service name can be redirected to different nodes each time.
    - Weighted Round Robin: Distributes load based on node weights, preferring higher-weight nodes for better resource utilization.
    - Weighted Random: Selects nodes randomly with probability proportional to their weights, providing statistical load distribution.
    - Least Response Time: Routes requests to the node with the lowest average response time for optimal performance.
    - Fastest Node: Always routes to the node with the lowest average response time, with caching for performance.
    - Hashing-based: In this strategy, the discovery hashes the IP of the client and based on that hash, It'll come up with the number and that numbered healthy node will be the chosen server. In Maxine, there are two hashing-based strategies are developed.
        - <a href="https://medium.com/swlh/load-balancing-and-consistent-hashing-5fe0156035e1">Consistent hashing</a>
        - <a href="https://randorithms.com/2020/12/26/rendezvous-hashing.html">Rendezvous hashing</a>
      - Least Connections: Distributes load to the node with the fewest active connections among healthy nodes.
      - Least Loaded: Routes requests to the service node with the least active connections.
      - Random: Randomly selects a healthy node for each request.
       - Power of Two Choices: Selects two random healthy nodes and chooses the one with fewer active connections.
       - Adaptive: Combines response time and connection metrics to select the optimal node for each request.
        - Sticky Round Robin: Routes the same client IP to the same node for session affinity, falling back to round robin for new clients.
        - Least Request: Routes requests to the node with the fewest active connections for minimal active connections.
        - IP Hash: Routes requests based on a hash of the service name for consistent node selection, useful for caching scenarios.
        - Predictive: Uses time-series trend analysis of response times to select nodes with improving performance trends.
### HeartBeat
- As we know that in order to let the service registry know that the service is alive, service has to send the heartbeat to the registry and after certain period of time (timeout), that service will be removed from the registry automatically so becore that service gets deregistered from registry, the service has to send the heartbeat again, That's why we call it a heart beat because it literally keeps beating in a period of time, Let's understand what is this heartbeat.
- Heartbeat in maxine is a special kind of request that contains all the meta data about the service.
- Basically, the once the service is alive, It'll start sending this request to the registry and this request will have some parameters (JSONised ofcourse) that represents the service metadata.
- Heartbeat API: POST /api/maxine/serviceops/heartbeat with JSON payload containing nodeId in format "serviceName:host:port".
- Below is the list and explaination of all the parameters that needs to be passed with the heartbeat request. (All the necessary parameters are marked with Astrik (*))
    - **ServiceName** (*): The name of the service, Note that the service name will be same for multiple nodes of the same service so that maxine can identify the nodes and distribute the traffic evenly.
    - **hostName** (*): This represents the hostname (IP Address typically) of the service. This is optional parameter. Maxine can extract the host address out of request so if this parameter is not passed, It'll be extracted from the request.
    However, it is always prefferable to pass the hostname manually because jf the service is masked by some proxy and if the firewall rules are strict and complicated, then the discovery will redirect to the url that might not work because of security issues.
    - **nodeName** (*): If the service is replicated and has multiple nodes, then the serviceName in all the nodes will be the same but the nodeName will be different.
    Multiple nodes with the same service name will be registered to Maxine and then discovery server will balance the load evenly.
    - **port** (Default 80 or 443): The port number that the service is running on top of.
    - **ssl** (Default false): To determine if ssl is configured on the host where service is running or not. If ssl is true, then the service URL will be have HTTPS (443) otherwise HTTP (80) will be used.
    - **timeOut** (Default 5): Defines the amount of time (typically in seconds only) after which service should be deregistered.
    Once the service is registered, It'll be deregistered after the timeout provided in the heartBeat.
    Once the service sends the heartBeat again in the given timeout then the tineout will be reset.
    - **weight** (Default 1): If the service is replicated with multiple nodes and if any of those nodes is deployed on more powerful machine and configuration, it is acceptable that that particular node has more computational power and ability to serve more number of request in the less or the same amount of time.
    So, weight property will replicate that node into registry that many times. Note that the limit of weight property is 10, meaning that a node can be 10x more powerful than the rest of the nodes.
     - **path**: URL path like /api/v1 or somethings, defines the default path after IP where discovery will redirect the request to.
     - **metadata**: Additional service metadata including custom health endpoints and tags for filtering.
          - **healthEndpoint**: Custom health check path (e.g., "/health"), defaults to root if not specified.
          - **tags**: Array of tags for service categorization and filtered discovery (e.g., ["prod", "api"]).
          - **priority**: Number for load balancing preference (higher values prioritized).
          - **group**: String for service grouping and hierarchical organization.
          - **deployment**: String for deployment versioning (e.g., "blue", "green").
          - **tenantId**: String for multi-tenant isolation.
          - **healthType**: 'tcp' for TCP health checks, 'http' for HTTP (default).
          - **healthMethod**: HTTP method for health checks (GET, POST, etc.), default GET.
          - **proxyTimeout**: Timeout for proxy requests in milliseconds.
    #### Example:
    ##### Heartbeat Request
        {
            "serviceName": "bed-mgmt",
            "hostName" : "10.72.131.21",
            "nodeName" : "Node-4",
            "port": 8080,
            "ssl" : true,
            "timeOut" : 30,
            "weight" : 5,
            "path" : "/api/v3"
        }
    ##### Response (Service registered)
        {
            "hostName": "10.72.131.21",
            "nodeName": "Node-4",
            "serviceName": "bed-mgmt",
            "timeOut": 30,
            "weight": 5,
            "address": "https://10.72.131.21:8080/api/v3",
            "registeredAt": "9/19/2022, 2:09:34 PM"
        }
- Maxine client takes care of sending the heartbeat to the registry but before you start the server, you have to provide all these parameters in the properties or configurations.
- If you pass the above example request to Maxine registry and then open the Maxine UI's servers page, it'll show the registered server like given below.
<img src="/en/latest/img/maxine-servers.png" />

### CLI Tool
- Maxine provides a command-line interface for managing services without direct API calls.
- Available commands include register, deregister, list, health, discover, metrics, backup, restore, and config.
- Use `node bin/cli.js <command> [options]` to interact with the registry programmatically or for automation.

### Asynchronous logging
- For Maxine SRD, logging is by default enabled and once you start the server, It'll start showing console logs, apart from that it'll also start storing logs into the files.
- But, the log files get created with some limits, The maxine has predefined value of maximum size of one log file, after that, It'll start to write the logs in the new file. 
- In the logging part, all these files will get named properly and they're always available in the logs directory but, in the production environment, most probably the OS will be based on CLI and interacting with logs from there is not that easy.
- So, to interacting with logs easily and directly, Maxine UI has Logging tab in it.
- From logging UI, you can control pretty much everything related to logging, you can turn on and off the asynchronous logging, you can JSONify the logs, Prettified JSONify the logs. Also, you can turn off the JSONified logs to make maxine log everything in plain format.
- Apart from that, in this Logging UI, there is also a logging console that'll show all the maxine logs live.
- Also, the old and archived logs will be available on UI, you can download the old and archived logs from the dropdown given right above the Logging console.
- Also, if you notice in the given picture, maxine supports the asyncronous logging, you can turn off and on it from the logging panel of the UI. It's recommended to keep the async logging on because it can significantly reduce the latency to serve requests.
<br>
<img src="/en/latest/img/maxine-logging.png" />
### Security
- Maxine implements JWT-based authentication for secure access to registry operations.
- All service operations (register, deregister, discover, health, metrics) require valid JWT tokens.
- Authentication is handled via the `/api/maxine/signin` endpoint with admin credentials.
### Performance Optimizations
- Optimized data structures using Maps and arrays for O(1) lookups and operations.
- Fast LCG PRNG for efficient random and geo-aware load balancing.
- Efficient round-robin implementation with array indexing.
- Simplified registry for minimal overhead.
- Pre-allocated response buffers for zero-allocation responses.
- Periodic cleanup every 30 seconds to remove expired services.
- Single-process mode for shared registry and maximum speed.
- Asynchronous persistence to disk to avoid blocking operations.
- Parallel federated registry calls for faster cross-registry discovery.
- Active health checks for proactive service monitoring.
- Circuit breakers for automatic failure detection and recovery.
- Rate limiting to protect against excessive requests.
- Event-driven architecture for real-time notifications.
  - Load test results: 5,000 requests with 50 concurrent users in ~0.1s, average response time 1.07ms, 95th percentile 1.71ms, 100% success rate, 40k req/s.
    ### Lightning Mode
     - Maxine lightning mode provides ultra-fast service discovery with core features for maximum performance.
     - Enabled by default for maximum performance, providing sub-millisecond service discovery with minimal overhead.
      - Core features: register, heartbeat, deregister, discover with round-robin/random/weighted-random/least-connections/ip-hash/geo-aware load balancing, health, metrics, federation, ACLs, intentions, service blacklists, active health checks, events.
     - Uses optimized data structures (Map<serviceName, array>) for O(1) operations.
     - Fast JSON serialization for reduced response overhead.
     - Single-process mode for shared registry.
     - Ideal for high-throughput microservices requiring sub-millisecond discovery times.
     - Recent optimizations: stripped to essential features, simplified data structures, fast LCG PRNG for random selection, efficient round-robin with array indexing, parallel operations, async I/O.
       - Achieves average 1.69ms response time with 27,083 req/s and 100% success rate in load tests (95th percentile 2.4ms).
### etcd Persistence
- Maxine supports etcd as a distributed key-value store backend for high availability and consistency.
- Enable with `ETCD_ENABLED=true` and configure `ETCD_HOST` and `ETCD_PORT`.
- Provides distributed persistence across multiple Maxine instances for production deployments.
### Kafka Event Streaming
- Maxine integrates with Kafka for real-time event streaming of registry changes.
- Enable with `KAFKA_ENABLED=true` and configure `KAFKA_BROKERS`.
- Publishes events for register, deregister, and health status changes to the `maxine-registry-events` topic.
- Enables event-driven architectures and real-time monitoring of service registry state.
### Config control
- Maxine config control provides interactive way to manage the configuration.
- the Settings and Logging tab provides options to monitor and manipulate the Maxine configuration.
- There are given configurations that can be modified in order to change the SRD's behaviour
    - Auto Reload Logs : To automatically reload logs in the UI
    - Async Logging : To turn on and off the Async logging
    - JSONified Logging : To Jsonify the logs, Logs console will show plain logs if turned off.
    - Prettify Logs : To pretify the JSONified logs (Works only if JSOnified logging is turned on).
    - Default heartbeat : To modify the default heartbeat timeout if the heartbeat is not bringing the timeout parameter from service.
     - Server selection strategy : To change the load balancer's server selection strategy. By default, it's Round robin but can be changed to weighted round robin, least response time, consistent hashing, rendezvous hashing, least connections, least loaded, random, power of two choices, adaptive, sticky round robin, or least request.
     - High Performance Mode : To enable/disable high performance mode for maximum throughput (disables advanced features).
     - Health Check Enabled : To enable/disable background health checks.
     - Clustering Enabled : To enable/disable multi-worker clustering for CPU utilization.
     - Persistence Enabled : To enable/disable persistence to file/Redis/etcd.
     - Metrics Enabled : To enable/disable metrics collection.
     - Tracing Enabled : To enable/disable OpenTelemetry tracing.
     - gRPC Enabled : To enable/disable gRPC discovery service.
     - Kubernetes Enabled : To enable/disable Kubernetes service discovery integration.
     - Consul Enabled : To enable/disable Consul service import.
     - etcd Enabled : To enable/disable etcd distributed persistence.
     - Kafka Enabled : To enable/disable Kafka event streaming.
     - Approval Required : To enable/disable registration approval workflows.
     - Status monitor : To turn on and off the status monitor.
### Custom Headers in Proxy Mode
- Maxine supports adding custom headers to proxied requests for advanced API gateway features.
- Specify `customHeaders` in service metadata as an object of header key-value pairs.
- Headers are merged with original request headers when proxying, enabling authentication headers, routing headers, etc.
- Useful for scenarios requiring header-based routing or authentication in service mesh architectures.

### Service Mesh Integrations
- Maxine provides comprehensive service mesh integration capabilities for seamless deployment in modern microservices architectures.

#### Envoy Proxy Configuration
- Generate complete Envoy proxy configurations via `/api/maxine/serviceops/envoy/config`.
- Includes health checks, circuit breakers, outlier detection, retry policies, and load balancing.
- Supports both HTTP and TCP upstreams with automatic service discovery integration.

#### AWS App Mesh Configuration
- Generate AWS App Mesh configurations via `/api/maxine/serviceops/appmesh/config`.
- Creates virtual services, virtual nodes, virtual routers, and routes for AWS service mesh.
- Enables seamless integration with AWS container services and serverless platforms.

#### Open Policy Agent (OPA) Policies
- Generate OPA policies for fine-grained access control via `/api/maxine/serviceops/opa/policies`.
- Creates Rego policies for service-level authorization based on user roles and service metadata.
- Supports rate limiting, authentication requirements, and custom access rules per service.

#### Istio ServiceEntry Generation
- Generate Istio ServiceEntry configurations via `/api/maxine/serviceops/istio/config`.
- Enables automatic service discovery and traffic management in Istio service mesh.

#### Linkerd Service Profile Generation
- Generate Linkerd Service Profile configurations via `/api/maxine/serviceops/linkerd/config`.
- Provides traffic splitting, retries, and timeouts for Linkerd service mesh integration.

#### Traefik Configuration Generation
- Generate Traefik dynamic configurations via `/api/maxine/serviceops/traefik/config`.
- Enables automatic service discovery and load balancing with Traefik reverse proxy.

#### Kubernetes Ingress Generation
- Generate Kubernetes Ingress YAML via `/api/maxine/serviceops/kubernetes/ingress`.
- Creates ingress resources for external access to services in Kubernetes clusters.

#### HAProxy Configuration Generation
- Generate HAProxy configurations via `/api/maxine/serviceops/haproxy/config`.
- Provides high-performance load balancing configurations for traditional infrastructure.

#### Nginx Configuration Generation
- Generate Nginx upstream configurations via `/api/maxine/serviceops/nginx/config`.
- Enables reverse proxy and load balancing with Nginx for high-traffic scenarios.

### Circuit Breaker Enhancements (Lightning Mode)
- Advanced circuit breaker with half-open state, exponential backoff retry logic, and configurable failure thresholds per node.
- Automatic recovery attempts with increasing delays to prevent cascading failures.
- Integration with WebSocket event streaming for real-time circuit state notifications.
- API endpoint `/circuit-breaker/:nodeId` for monitoring circuit breaker states.

### MQTT Integration (Lightning Mode)
- Optional MQTT client for publishing real-time events to MQTT brokers.
- Configurable broker URL and topic base for event publishing.
- QoS 1 reliability for event delivery.
- Enables integration with IoT and event-driven architectures.

### WebSocket Event Filtering and Persistence (Lightning Mode)
- Subscription-based event filtering by event type, service name, and node ID.
- In-memory event history storage for retrieving missed events.
- Event replay API `/events?since=<timestamp>&limit=<number>` for client reconnection.
- JWT-based authentication for secure WebSocket connections.

### Event Streaming Enhancements
- Real-time event broadcasting via WebSocket and MQTT.
- Event types include service_registered, service_deregistered, service_heartbeat, service_unhealthy, circuit_open, circuit_closed, circuit_half_open.
- Filtered subscriptions for targeted event delivery.
- Persistent event history for missed event retrieval.