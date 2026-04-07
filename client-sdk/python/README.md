# Maxine Python Client

The Python SDK provides a small, dependency-free client for the current Maxine
API.

## Install locally

```bash
pip install maxine-client
```

## Usage

```python
from maxine_client import MaxineClient

client = MaxineClient("http://localhost:8080")
client.sign_in("admin", "admin")

registration = {
    "hostName": "127.0.0.1",
    "nodeName": "orders-node",
    "serviceName": "orders-service",
    "port": 8081,
    "ssl": False,
    "timeOut": 10,
    "weight": 1,
}

client.register(registration)
discovery = client.discover_location("orders-service", "/health")
print(discovery["location"])
```

### Background heartbeats

```python
heartbeat = client.start_heartbeat(registration, interval_seconds=5)

# Later, when shutting down:
heartbeat.stop()
```
