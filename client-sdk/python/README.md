# Maxine Python Client

A Python client library for interacting with the Maxine Service Registry and Discovery server.

## Installation

```bash
pip install maxine-client
```

## Usage

```python
from maxine_client import MaxineClient

# Initialize client
client = MaxineClient(base_url="http://localhost:8080")

# Register a service (Full Mode)
response = client.register_service(
    service_name="my-service",
    address="http://localhost:3000",
    metadata={"version": "1.0.0"}
)
print(response)

# Discover a service (Full Mode)
service = client.discover_service("my-service")
print(service)

# Get service health
health = client.get_service_health("my-service")
print(health)

# Get metrics
metrics = client.get_metrics()
print(metrics)

# Lightning Mode for ultra-fast operations
# Register a service (Lightning Mode)
response = client.register_service_lightning(
    service_name="my-service",
    host="localhost",
    port=3000,
    metadata={"version": "1.0.0"},
    tags=["web", "api"]
)
print(response)

# Discover a service (Lightning Mode)
service = client.discover_service_lightning("my-service", strategy="round-robin")
print(service)

# Send heartbeat (Lightning Mode)
heartbeat = client.heartbeat_lightning("my-service:localhost:3000")
print(heartbeat)

# Ultra-fast UDP discovery
service = client.discover_service_udp("my-service")
print(service)
```

## API Reference

### MaxineClient

#### `__init__(base_url="http://localhost:8080", timeout=5)`

Initialize the Maxine client.

- `base_url`: Base URL of the Maxine server
- `timeout`: Request timeout in seconds

#### `register_service(service_name, address, node_name=None, metadata=None)`

Register a service with the registry.

#### `deregister_service(service_name, node_name)`

Deregister a service from the registry.

#### `discover_service(service_name, version=None, namespace="default", region="default", zone="default", proxy=False)`

Discover a service instance.

#### `get_service_health(service_name, namespace="default")`

Get health status of all nodes for a service.

#### `get_metrics()`

Get service registry metrics.

#### `list_services()`

List all registered services.

#### `get_cache_stats()`

Get discovery cache statistics.

#### `get_service_changes(since=0)`

Get registry changes since timestamp.

#### Lightning Mode Methods

##### `register_service_lightning(service_name, host, port, metadata=None, tags=None, version=None, environment=None, namespace="default", datacenter="default")`

Register a service using Lightning Mode API for maximum speed.

##### `discover_service_lightning(service_name, strategy="round-robin", client_id=None, tags=None, version=None, environment=None, namespace="default", datacenter="default")`

Discover a service using Lightning Mode API with advanced load balancing strategies.

##### `heartbeat_lightning(node_id)`

Send heartbeat using Lightning Mode API.

##### `deregister_service_lightning(service_name, node_name, namespace="default", datacenter="default")`

Deregister a service using Lightning Mode API.

##### `list_services_lightning()`

List all services using Lightning Mode API.

##### `get_health_lightning()`

Get health status using Lightning Mode API.

##### `discover_service_udp(service_name, udp_port=8081, udp_host="localhost")`

Discover a service via UDP for ultra-fast lookups.

##### `discover_service_tcp(service_name, tcp_port=8082, tcp_host="localhost")`

Discover a service via TCP for reliable fast lookups.

## License

MIT License