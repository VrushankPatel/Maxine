# Maxine Client SDKs

This directory contains client SDKs for various programming languages to interact with the Maxine service registry.

## JavaScript/Node.js SDK

The JavaScript SDK provides HTTP, UDP, and TCP discovery methods for maximum performance.

### Installation

```bash
npm install maxine-client
```

### Usage

```javascript
const MaxineClient = require('maxine-client');

const client = new MaxineClient('http://localhost:8080', 'your-jwt-token');

// Register a service
await client.register({
  serviceName: 'my-service',
  nodeName: 'node-1',
  hostName: 'localhost',
  port: 3000,
  weight: 1
});

// Discover a service
const service = await client.discover('my-service');
console.log(service.address); // http://localhost:3000

// UDP discovery for ultra-fast lookups
const serviceUdp = await client.discoverUdp('my-service', 8081);

// TCP discovery for reliable ultra-fast lookups
const serviceTcp = await client.discoverTcp('my-service', 8082);
```

### Methods

- `register(serviceData)`: Register a service
- `deregister(serviceName, nodeName, namespace)`: Deregister a service
- `discover(serviceName, options)`: Discover service via HTTP
- `discoverUdp(serviceName, port, host)`: Discover via UDP
- `discoverTcp(serviceName, port, host)`: Discover via TCP (new)
- `getServiceInfo(serviceName, options)`: Get service info
- `getHealth(serviceName, namespace)`: Get service health
- `getMetrics()`: Get registry metrics
- And more...

## Python SDK

The Python SDK supports HTTP, UDP, TCP, and WebSocket connections for comprehensive service discovery and real-time event streaming.

### Installation

```bash
pip install maxine-client
```

### Usage

```python
from maxine_client import MaxineClient, WebSocketClient

# HTTP client
client = MaxineClient()

# Register service
client.register_service_lightning("my-service", "localhost", 3000, tags=["web"])

# Discover service
service = client.discover_service_lightning("my-service")

# WebSocket client for real-time events
ws_client = WebSocketClient()
ws_client.on_event("service_registered", lambda data: print(data))
ws_client.connect()
```

## PHP SDK

The PHP SDK provides both Full Mode and Lightning Mode APIs with caching support.

### Installation

```bash
composer require maxine/maxine-client
```

### Usage

```php
use Maxine\MaxineClient;

$client = new MaxineClient("http://localhost:8080");

// Register service
$client->registerServiceLightning("my-service", "localhost", 3000);

// Discover service
$service = $client->discoverServiceLightning("my-service");
echo $service['address'] . ":" . $service['port'];
```

## Other SDKs

See individual README files in subdirectories for Java, Go, C#, and Rust SDKs.