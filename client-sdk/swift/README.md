# Maxine Swift Client SDK

A Swift client for interacting with the Maxine service registry and discovery server. Supports iOS, macOS, watchOS, and tvOS with offline caching capabilities.

## Features

- **Lightning Fast**: Optimized for performance with intelligent caching
- **Async/Await**: Modern Swift concurrency support
- **Offline Caching**: LRU cache with TTL for service discovery results
- **WebSocket Support**: Real-time event streaming
- **Comprehensive API**: Full support for all Maxine features
- **Cross-Platform**: Works on iOS, macOS, watchOS, and tvOS

## Installation

### Swift Package Manager

Add the following to your `Package.swift` file:

```swift
dependencies: [
    .package(url: "https://github.com/VrushankPatel/Maxine.git", from: "1.0.0")
]
```

### Manual Installation

Copy `MaxineClient.swift` into your project.

## Usage

### Basic Usage

```swift
import Foundation

// Initialize client
let client = MaxineClient(baseURL: URL(string: "http://localhost:8080")!)

// Register a service
Task {
    do {
        let response = try await client.registerService(
            serviceName: "my-service",
            host: "localhost",
            port: 3000,
            metadata: ["version": "1.0"],
            tags: ["web", "api"]
        )
        print("Service registered:", response)
    } catch {
        print("Registration failed:", error)
    }
}
```

### Service Discovery

```swift
Task {
    do {
        let service = try await client.discoverService(
            serviceName: "my-service",
            strategy: "round-robin",
            tags: ["web"]
        )
        print("Discovered service:", service)
    } catch {
        print("Discovery failed:", error)
    }
}
```

### WebSocket Events

```swift
import Foundation

let wsClient = WebSocketClient(baseURL: URL(string: "ws://localhost:8080")!)

// Register event handler
wsClient.onEvent(eventType: "service_registered") { eventType, data in
    print("Service registered:", data)
}

// Connect and subscribe
wsClient.connect()
wsClient.subscribe(eventType: "service_registered", serviceName: "my-service")
```

### Advanced Features

```swift
// Health monitoring
let health = try await client.getHealthScores(serviceName: "my-service")
let predictions = try await client.predictHealth(serviceName: "my-service")

// Traffic management
try await client.setTrafficDistribution(
    serviceName: "my-service",
    distribution: ["1.0": 80, "2.0": 20]
)

// Configuration management
try await client.setConfig(
    serviceName: "my-service",
    key: "timeout",
    value: 5000
)
```

## API Reference

### MaxineClient

#### Initialization
- `init(baseURL: URL, timeout: TimeInterval, cacheMaxSize: Int, cacheTTL: TimeInterval)`

#### Service Management
- `registerService(serviceName: String, host: String, port: Int, ...) async throws -> [String: Any]`
- `deregisterService(serviceName: String, nodeName: String, ...) async throws -> [String: Any]`
- `heartbeat(nodeId: String) async throws -> [String: Any]`

#### Service Discovery
- `discoverService(serviceName: String, strategy: String, ...) async throws -> [String: Any]`
- `listServices() async throws -> [String: Any]`
- `getVersions(serviceName: String) async throws -> [String: Any]`

#### Health & Monitoring
- `getHealth() async throws -> [String: Any]`
- `getMetrics() async throws -> [String: Any]`
- `getHealthScores(serviceName: String) async throws -> [String: Any]`
- `predictHealth(serviceName: String, window: Double) async throws -> [String: Any]`
- `getAnomalies() async throws -> [String: Any]`

#### Traffic Management
- `setTrafficDistribution(serviceName: String, distribution: [String: Double]) async throws -> [String: Any]`
- `promoteVersion(serviceName: String, version: String) async throws -> [String: Any]`
- `retireVersion(serviceName: String, version: String) async throws -> [String: Any]`
- `shiftTraffic(serviceName: String, fromVersion: String, toVersion: String, percentage: Double) async throws -> [String: Any]`

#### Configuration
- `setConfig(serviceName: String, key: String, value: Any, ...) async throws -> [String: Any]`
- `getConfig(serviceName: String, key: String, ...) async throws -> Any`
- `getAllConfigs(serviceName: String, ...) async throws -> [String: Any]`
- `deleteConfig(serviceName: String, key: String, ...) async throws -> [String: Any]`

#### Dependencies
- `addDependency(serviceName: String, dependsOn: String) async throws -> [String: Any]`
- `removeDependency(serviceName: String, dependsOn: String) async throws -> [String: Any]`
- `getDependencies(serviceName: String) async throws -> [String: Any]`
- `getDependents(serviceName: String) async throws -> [String: Any]`
- `getDependencyGraph() async throws -> [String: Any]`
- `detectCycles() async throws -> [String: Any]`

#### Analytics
- `recordResponseTime(nodeId: String, responseTime: Double) async throws -> [String: Any]`
- `recordCall(callerService: String, calledService: String) async throws -> [String: Any]`

#### Cache Management
- `clearCache()`

### WebSocketClient

#### Initialization
- `init(baseURL: URL, token: String?)`

#### Connection Management
- `connect()`
- `disconnect()`

#### Event Handling
- `onEvent(eventType: String, handler: @escaping (String, [String: Any]) -> Void)`
- `subscribe(eventType: String, serviceName: String?, nodeId: String?)`
- `unsubscribe()`
- `refreshToken()`

## Requirements

- iOS 15.0+ / macOS 12.0+ / watchOS 8.0+ / tvOS 15.0+
- Swift 5.5+

## Error Handling

All methods throw errors that can be caught and handled:

```swift
do {
    let result = try await client.discoverService(serviceName: "my-service")
    // Handle success
} catch {
    // Handle error
    print("Error:", error.localizedDescription)
}
```

## Thread Safety

The client is thread-safe and can be used from any thread. All operations are performed asynchronously.

## License

MIT License</content>
</xai:function_call">Now, mark the Swift SDK as completed and start on Kotlin SDK. 

<xai:function_call name="todowrite">
<parameter name="todos">[{"content":"Implement Swift/iOS Client SDK with support for all major platforms and offline caching","status":"completed","priority":"high","id":"implement_swift_sdk"}]