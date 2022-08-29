# Maxine Features
### HeartBeat, parameters all
### Service registry
- The service registry is the part of Maxine that register or save the service metadata (Extracted data like serviceName, hostName, nodeName, port, SSL, timeOut, weight, path from heartbeat) in memory to make the retrieval faster.
- Also, the SRD replicates the more weighted services (The service that sends a weight of more than one).
- After registering the Service, the SRD will run a thread asynchronously that'll remove that service from the registry once the timeout exceeds and that Service is not re-registered.
- If the service sends the heartbeat before the timeout passes since it was registered, then the thread that was executed earlier will be suspended and a new thread will start doing the same again.
### Service discovery
- The service discovery discovers the service that is registered in the registry.
- When the service discovery receives the request, it extracts the serviceName from the request and discovers the service with that service name.
- If discovery finds the single service node with that serviceName, then It'll simply redirect that request to that service's URL.
- If there are multiple nodes of the same service in the registry, then discovery has to distribute the traffic across all of them, that's where Maxine's load balancer comes to rescue.
### Load Balancing
- If there are multiple nodes of that service available in the registry, then the discovery needs to distribute the load across those nodes.
- Choosing the right server is a very important thing here because if we're using the server-side and server-specific cache, then choosing the wrong node or server might cost us (High latency especially).
- Here, the Maxine discovery comes with three server-selection strategies.
        * Round robin: This strategy is very simple, discovery will start forwarding the request to the next server each server in turn and in order so, it's fairly simple. Note that the requests to the same service name can be redirected to different nodes each time.
        * Hashing-based: In this strategy, the discovery hashes the IP of the client and based on that hash, It'll come up with the number and that numbered node will be the chosen server. In Maxine, there are two hashing-based strategies are developed.
    - <a href="https://medium.com/swlh/load-balancing-and-consistent-hashing-5fe0156035e1">Consistent hashing</a>
    - <a href="https://randorithms.com/2020/12/26/rendezvous-hashing.html">Rendezvous hashing</a>
### Logging
### Config control
### Dashboard