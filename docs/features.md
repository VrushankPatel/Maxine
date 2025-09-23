# Maxine Features
### Dashboard UI
- Maxine dashboard UI provides a very interactive way to monitor the configuration, logs, SRD info and the SRD's current status like memory occupied, requests per second etc.

<img src="/en/latest/img/maxine-dashboard.png" />
### Service registry
- The service registry is the part of Maxine that register or save the service metadata (Extracted data like serviceName, hostName, nodeName, port, SSL, timeOut, weight, path from heartbeat) in memory to make the retrieval faster.
- Also, the SRD replicates the more weighted services (The service that sends a weight of more than one).
- After registering the Service, the SRD will run a thread asynchronously that'll remove that service from the registry once the timeout exceeds and that Service is not re-registered.
- If the service sends the heartbeat before the timeout passes since it was registered, then the thread that was executed earlier will be suspended and a new thread will start doing the same again.
- The registry now persists to disk, allowing services to survive server restarts.
### Service discovery
- The service discovery discovers the service that is registered in the registry.
- When the service discovery receives the request, it extracts the serviceName from the request and discovers the service with that service name.
- Discovery supports version-specific routing via the optional `version` query parameter, allowing clients to target specific service versions (defaults to any version if not specified).
- Service aliases allow services to be discoverable under multiple names, providing flexibility in service naming and migration scenarios.
- Service maintenance mode allows temporary exclusion of service nodes from discovery without deregistration, useful for planned maintenance or upgrades via `/api/maxine/serviceops/maintenance`.
- Traffic splitting for versions allows services to define `trafficSplit` in metadata to route percentages of requests to different versions, enabling canary deployments and gradual rollouts.
- If discovery finds the single service node with that serviceName, then It'll simply redirect that request to that service's URL.
- If there are multiple nodes of the same service in the registry, then discovery has to distribute the traffic across all of them, that's where Maxine's load balancer comes to rescue.
- Filtered discovery allows routing to services based on tags, enabling environment-specific or feature-specific routing via `/api/maxine/serviceops/discover/filtered?serviceName=<name>&tags=<tag1>,<tag2>`.
### Health checks
- Maxine provides comprehensive health monitoring for registered services with both on-demand, background, and push-based checks.
- The health check endpoint `/api/maxine/serviceops/health?serviceName=<name>` performs parallel HTTP requests to all nodes of the specified service and reports their status.
  - Background health checks run continuously every 60 seconds to maintain up-to-date service status without impacting request latency.
- Push health updates allow services to send their health status directly via `/api/maxine/serviceops/health/push` with JSON payload containing serviceName, nodeName, status ('healthy' or 'unhealthy'), and optional namespace, enabling faster health monitoring without pull-based checks.
- Health status is cached in optimized data structures, enabling circuit breaker functionality with failure counting that automatically skips unhealthy nodes during discovery.
- Circuit breaker includes automatic recovery when services become healthy again, improving overall system reliability and performance.
- Health check history is tracked for each service node, accessible via `/api/maxine/serviceops/health/history?serviceName=<name>&nodeName=<node>` to monitor service stability over time.
- Advanced health checks support custom HTTP methods (GET, POST, etc.) via `healthMethod` in service metadata, and TCP checks via `healthType: 'tcp'`.
### Metrics
- Maxine provides comprehensive metrics collection for monitoring performance and usage.
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
- This enables clients to poll for updates and maintain synchronized views of the service registry without full refreshes.
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
- Both SDKs support all major operations: register, deregister, discover, health checks, and metrics retrieval.
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

### WebSocket Real-time Updates
- Maxine supports WebSocket connections for real-time notifications of service registry changes.
- Connect to `ws://localhost:8080` to receive events for register, deregister, and health status updates.
- Events are sent as JSON messages with type, serviceName, nodeName, data, and timestamp.

### Webhook Notifications
- Maxine supports webhook notifications for real-time alerts on service registry changes.
- Register webhooks via `/api/maxine/serviceops/webhooks/add` with serviceName and URL.
- Receive HTTP POST notifications to the webhook URL for register, deregister, and health status change events.
- Webhooks enable external systems to react immediately to service availability changes without polling.
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
  - Here, the Maxine discovery comes with nine server-selection strategies.
    - Round robin: This strategy is very simple, discovery will start forwarding the request to the next healthy server each server in turn and in order. Note that the requests to the same service name can be redirected to different nodes each time.
    - Weighted Round Robin: Distributes load based on node weights, preferring higher-weight nodes for better resource utilization.
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
### HeartBeat
- As we know that in order to let the service registry know that the service is alive, service has to send the heartbeat to the registry and after certain period of time (timeout), that service will be removed from the registry automatically so becore that service gets deregistered from registry, the service has to send the heartbeat again, That's why we call it a heart beat because it literally keeps beating in a period of time, Let's understand what is this heartbeat.
- Heartbeat in maxine is a special kind of request that contains all the meta data about the service.
- Basically, the once the service is alive, It'll start sending this request to the registry and this request will have some parameters (JSONised ofcourse) that represents the service metadata. 
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
- Available commands include register, deregister, list, health, discover, and metrics.
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
  - In-memory LRU caching for discovery operations with configurable TTL (10min) and increased size (1M entries) to reduce lookup times and support high-throughput scenarios.
  - Healthy nodes cache eliminates filtering overhead, ensuring sub-millisecond service discovery lookups.
  - Debounced asynchronous file saves to minimize I/O blocking during high-frequency registrations with persistence across restarts.
  - Background parallel health checks with configurable interval (default 60 seconds) and concurrency (default 50) using native HTTP modules for reduced overhead and maintain service status without request latency impact.
  - Aggressive connection pooling for HTTP proxying (10,000 max sockets, keep-alive) to handle thousands of concurrent requests.
  - Circuit breaker with failure counting automatically isolates unhealthy nodes while allowing recovery.
  - Configurable API rate limiting (default 10,000 requests per 15 minutes per IP) prevents abuse and ensures stability under load.
  - High performance mode disables logging for discovery endpoints to reduce overhead under extreme load.
  - Conditional metrics collection can be disabled for maximum performance.
  - Optimized data structures using Maps and Sets for O(1) lookups in healthy nodes and response times tracking, providing lightning-fast service resolution for microservices architectures.
  - Caching in load balancing strategies (e.g., Least Response Time, Fastest) for reduced computation overhead.
   - Compression enabled when high performance mode is disabled for reduced response sizes and improved network performance.
    - HTTP/2 support enabled by default for multiplexing and reduced latency over HTTP/1.1.
   - Optimized string operations in discovery controller to minimize CPU usage.
   - Native HTTP implementation for health checks eliminates axios dependency overhead.
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
     - Server selection strategy : To change the load balancer's server selection strategy. By default, it's Round robin but can be changed to weighted round robin, least response time, consistent hashing, rendezvous hashing, least connections, least loaded, random, or power of two choices.
    - Status monitor : To turn on and off the status monitor.