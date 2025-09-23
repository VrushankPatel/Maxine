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

# Register a service
response = client.register_service(
    service_name="my-service",
    address="http://localhost:3000",
    metadata={"version": "1.0.0"}
)
print(response)

# Discover a service
service = client.discover_service("my-service")
print(service)

# Get service health
health = client.get_service_health("my-service")
print(health)

# Get metrics
metrics = client.get_metrics()
print(metrics)
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

## License

MIT License