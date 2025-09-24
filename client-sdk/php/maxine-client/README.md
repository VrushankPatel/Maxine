# Maxine PHP Client

PHP client library for the Maxine Service Registry.

## Installation

```bash
composer require maxine/maxine-client
```

## Usage

### Basic Usage

```php
use Maxine\MaxineClient;

$client = new MaxineClient("http://localhost:8080");

// Register a service
$response = $client->registerService("my-service", "http://localhost:3000");
echo "Registered node: " . $response['nodeId'] . "\n";

// Discover a service
$service = $client->discoverService("my-service");
echo "Found service at: " . $service['address'] . "\n";

// Send heartbeat
$client->heartbeatLightning($response['nodeId']);
```

### Lightning Mode (High Performance)

```php
// Register with Lightning Mode API
$response = $client->registerServiceLightning("my-service", "localhost", 3000, [
    "version" => "1.0",
    "tags" => ["web", "api"]
]);

// Discover with load balancing
$service = $client->discoverServiceLightning("my-service", "round-robin");
echo "Service address: " . $service['address'] . ":" . $service['port'] . "\n";
```

### Advanced Features

```php
// With caching (enabled by default)
$client = new MaxineClient("http://localhost:8080", 5, 100, 30);

// Get service health
$health = $client->getServiceHealth("my-service");
print_r($health);

// Get metrics
$metrics = $client->getMetrics();
echo "Total services: " . $metrics['services'] . "\n";

// List all services
$services = $client->listServices();
print_r($services);
```

## Configuration

```php
$client = new MaxineClient(
    baseUrl: "http://localhost:8080",  // Maxine server URL
    timeout: 5,                        // Request timeout in seconds
    cacheMax: 100,                     // Maximum cache entries
    cacheTtl: 30                       // Cache TTL in seconds
);
```

## API Methods

### Full Mode API
- `registerService($serviceName, $address, $nodeName = null, $metadata = null)`
- `deregisterService($serviceName, $nodeName)`
- `discoverService($serviceName, $version = null, $namespace = "default", $region = "default", $zone = "default", $proxy = false)`
- `getServiceHealth($serviceName, $namespace = "default")`
- `getMetrics()`
- `listServices()`

### Lightning Mode API (High Performance)
- `registerServiceLightning($serviceName, $host, $port, $metadata = null, $tags = null, $version = null, $environment = null, $namespace = "default", $datacenter = "default")`
- `discoverServiceLightning($serviceName, $strategy = "round-robin", $clientId = null, $tags = null, $version = null, $environment = null, $namespace = "default", $datacenter = "default")`
- `heartbeatLightning($nodeId)`
- `deregisterServiceLightning($serviceName, $nodeName, $namespace = "default", $datacenter = "default")`
- `listServicesLightning()`
- `getHealthLightning()`

## Load Balancing Strategies

- `round-robin` (default)
- `random`
- `weighted-random`
- `least-connections`
- `consistent-hash`
- `ip-hash`
- `geo-aware`
- `least-response-time`
- `health-score`
- `predictive`

## Error Handling

All methods throw `\Exception` on HTTP errors:

```php
try {
    $service = $client->discoverService("non-existent-service");
} catch (\Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
```

## Requirements

- PHP 7.4+
- cURL extension
- JSON extension