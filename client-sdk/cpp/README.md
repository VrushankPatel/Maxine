# Maxine C++ Client SDK

A high-performance C++ client SDK for the Maxine service registry, designed for low-latency applications and game servers.

## Features

- **Lightning Mode Support**: Optimized for maximum performance with minimal overhead
- **Full Mode Support**: Complete feature set for comprehensive service management
- **Modern C++**: Uses C++17 features and smart pointers for memory safety
- **HTTP Client**: Built on cpp-httplib for efficient HTTP communication
- **JSON Handling**: Uses nlohmann/json for robust JSON parsing

## Requirements

- C++17 compatible compiler
- CMake 3.16+
- cpp-httplib
- nlohmann/json

## Installation

### Dependencies

```bash
# Ubuntu/Debian
sudo apt-get install nlohmann-json3-dev

# Or install cpp-httplib via vcpkg or manually
```

### Build

```bash
mkdir build
cd build
cmake ..
make
sudo make install
```

## Usage

### Basic Example

```cpp
#include <maxine/MaxineClient.hpp>
#include <iostream>

int main() {
    maxine::MaxineClient client("http://localhost:8080");

    // Discover a service (Lightning Mode)
    auto node = client.discoverLightning("my-service");
    if (node) {
        std::cout << "Found service at: " << node->address << std::endl;
    }

    // Register a service
    std::string nodeId = client.registerLightning("my-service", "localhost", 3000);
    if (!nodeId.empty()) {
        std::cout << "Registered with node ID: " << nodeId << std::endl;
    }

    // Heartbeat
    bool success = client.heartbeatLightning(nodeId);
    if (success) {
        std::cout << "Heartbeat sent successfully" << std::endl;
    }

    return 0;
}
```

### Advanced Example

```cpp
#include <maxine/MaxineClient.hpp>
#include <nlohmann/json.hpp>

int main() {
    maxine::MaxineClient client("http://localhost:8080");
    client.withApiKey("your-api-key");

    // Register with metadata
    nlohmann::json metadata = {
        {"version", "1.0"},
        {"weight", 10},
        {"tags", {"api", "production"}}
    };

    std::string nodeId = client.registerLightning("api-service", "localhost", 8080, metadata);

    // Discover with load balancing
    auto node = client.discoverLightning("api-service", "weighted-random", "1.0", {"api"});

    // Get health scores
    auto scores = client.healthScores("api-service");
    for (const auto& score : scores) {
        std::cout << "Node " << score.node_id << " health: " << score.score << std::endl;
    }

    return 0;
}
```

## API Reference

### Lightning Mode APIs

- `discoverLightning(service_name, load_balancing, version, tags)`: Discover a service instance
- `registerLightning(service_name, host, port, metadata)`: Register a service instance
- `heartbeatLightning(node_id)`: Send heartbeat for a service instance
- `deregisterLightning(node_id)`: Deregister a service instance
- `serversLightning()`: Get list of all registered services
- `healthLightning()`: Get health status
- `metricsLightning()`: Get performance metrics

### Full Mode APIs

- `services()`: Get all registered services
- `service(service_name)`: Get details of a specific service
- `healthScores(service_name)`: Get health scores for service nodes
- `anomalies()`: Get detected anomalies
- `versions(service_name)`: Get available versions for a service

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

All methods return appropriate error indicators:
- Discovery methods return `nullptr` on failure
- Registration returns empty string on failure
- Boolean methods return `false` on failure

Check return values and handle errors appropriately in production code.

## Thread Safety

The client is not thread-safe. Create separate client instances for concurrent operations or use external synchronization.

## Performance

This SDK is optimized for high-performance applications:
- Minimal allocations with smart pointers
- Efficient JSON parsing
- Connection pooling via underlying HTTP client
- Support for both blocking and async patterns (future extension)