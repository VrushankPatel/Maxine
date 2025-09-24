# Maxine Dart Client SDK

A Dart/Flutter client SDK for the Maxine service registry, optimized for mobile and web applications.

## Features

- **Lightning Mode Support**: Optimized for maximum performance with minimal overhead
- **Full Mode Support**: Complete feature set for comprehensive service management
- **Async/Await**: Modern Dart async patterns
- **HTTP Client**: Built on Dart's HttpClient for efficient networking
- **JSON Handling**: Automatic JSON encoding/decoding
- **API Key Support**: Secure authentication with API keys

## Installation

Add to your `pubspec.yaml`:

```yaml
dependencies:
  maxine_client:
    git:
      url: https://github.com/VrushankPatel/Maxine
      path: client-sdk/dart
```

Or copy the `maxine_client.dart` file to your project.

## Usage

### Basic Example

```dart
import 'package:maxine_client/maxine_client.dart';

void main() async {
  final client = MaxineClient('http://localhost:8080');

  // Discover a service (Lightning Mode)
  final node = await client.discoverLightning('my-service');
  if (node != null) {
    print('Found service at: ${node['address']}');
  }

  // Register a service
  final nodeId = await client.registerLightning('my-service', 'localhost', 3000);
  if (nodeId != null) {
    print('Registered with node ID: $nodeId');
  }

  // Heartbeat
  final success = await client.heartbeatLightning(nodeId!);
  if (success) {
    print('Heartbeat sent successfully');
  }

  client.close();
}
```

### Advanced Example

```dart
import 'package:maxine_client/maxine_client.dart';

void main() async {
  final client = MaxineClient('http://localhost:8080', apiKey: 'your-api-key');

  // Register with metadata
  final metadata = {
    'version': '1.0',
    'weight': 10,
    'tags': ['api', 'production']
  };

  final nodeId = await client.registerLightning('api-service', 'localhost', 8080, metadata: metadata);

  // Discover with load balancing
  final node = await client.discoverLightning(
    'api-service',
    loadBalancing: 'weighted-random',
    version: '1.0',
    tags: ['api'],
  );

  // Get health scores
  final scores = await client.healthScores('api-service');
  if (scores != null) {
    for (final entry in scores['scores'].entries) {
      print('Node ${entry.key} health: ${entry.value}');
    }
  }

  // Get anomalies
  final anomalies = await client.anomalies();
  if (anomalies != null) {
    for (final anomaly in anomalies['anomalies']) {
      print('Anomaly: ${anomaly['type']} for ${anomaly['serviceName']}');
    }
  }

  client.close();
}
```

## API Reference

### Lightning Mode APIs

- `discoverLightning(serviceName, {loadBalancing, version, tags})`: Discover a service instance
- `registerLightning(serviceName, host, port, {metadata})`: Register a service instance
- `heartbeatLightning(nodeId)`: Send heartbeat for a service instance
- `deregisterLightning(nodeId)`: Deregister a service instance
- `serversLightning()`: Get list of all registered services
- `healthLightning()`: Get health status
- `metricsLightning()`: Get performance metrics

### Full Mode APIs

- `versions(serviceName)`: Get available versions for a service
- `healthScores(serviceName)`: Get health scores for service nodes
- `anomalies()`: Get detected anomalies

## Load Balancing Strategies

- `round-robin`: Default round-robin distribution
- `random`: Random selection
- `weighted-random`: Weighted random based on node weights
- `least-connections`: Select node with fewest connections
- `weighted-least-connections`: Weighted least connections
- `consistent-hash`: Consistent hashing for session affinity
- `ip-hash`: Hash based on client IP
- `geo-aware`: Select closest node based on geography
- `least-response-time`: Select fastest responding node
- `health-score`: Select highest health score node
- `predictive`: Use predictive analytics for selection
- `ai-driven`: AI-powered load balancing
- `cost-aware`: Prefer lower-cost infrastructure

## Error Handling

All methods return `null` on failure. Check return values and handle errors appropriately in production code.

## Thread Safety

The client is not thread-safe. Create separate client instances for concurrent operations.

## Performance

This SDK is optimized for mobile and web applications:
- Efficient HTTP client usage
- Minimal allocations
- Async operations for non-blocking UI
- Support for both mobile and web platforms