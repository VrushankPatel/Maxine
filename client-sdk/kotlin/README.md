# Maxine Kotlin Client SDK

A Kotlin client for interacting with the Maxine service registry and discovery server. Optimized for Android with background sync and battery optimization features.

## Features

- **Kotlin Coroutines**: Asynchronous operations with suspend functions
- **Android Optimized**: Battery-efficient background sync and caching
- **Offline Caching**: LRU cache with TTL for service discovery results
- **Comprehensive API**: Full support for all Maxine features
- **Thread Safe**: Concurrent access with mutex-based synchronization

## Installation

### Gradle

Add to your `build.gradle.kts`:

```kotlin
dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.code.gson:gson:2.10.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
}
```

### Manual Installation

Copy `MaxineClient.kt` into your project and add the required dependencies.

## Usage

### Basic Usage

```kotlin
import com.maxine.client.MaxineClient
import kotlinx.coroutines.*

// Initialize client
val client = MaxineClient(baseUrl = "http://localhost:8080")

// Register a service
CoroutineScope(Dispatchers.IO).launch {
    try {
        val response = client.registerService(
            serviceName = "my-service",
            host = "localhost",
            port = 3000,
            metadata = mapOf("version" to "1.0"),
            tags = listOf("web", "api")
        )
        println("Service registered: $response")
    } catch (e: Exception) {
        println("Registration failed: ${e.message}")
    }
}
```

### Service Discovery

```kotlin
CoroutineScope(Dispatchers.IO).launch {
    try {
        val service = client.discoverService(
            serviceName = "my-service",
            strategy = "round-robin",
            tags = listOf("web")
        )
        println("Discovered service: $service")
    } catch (e: Exception) {
        println("Discovery failed: ${e.message}")
    }
}
```

### Advanced Features

```kotlin
// Health monitoring
val health = client.getHealthScores("my-service")
val predictions = client.predictHealth("my-service")

// Traffic management
client.setTrafficDistribution(
    serviceName = "my-service",
    distribution = mapOf("1.0" to 80.0, "2.0" to 20.0)
)

// Configuration management
client.setConfig(
    serviceName = "my-service",
    key = "timeout",
    value = 5000
)
```

### Android Background Sync

```kotlin
class ServiceDiscoveryWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        val client = MaxineClient()
        return try {
            // Perform background service discovery
            val services = client.listServices()
            // Cache results for offline use
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
```

## API Reference

### MaxineClient

#### Initialization
- `MaxineClient(baseUrl: String, timeoutSeconds: Long, cacheMaxSize: Int, cacheTtlSeconds: Long)`

#### Service Management
- `registerService(serviceName: String, host: String, port: Int, ...): Map<String, Any>`
- `deregisterService(serviceName: String, nodeName: String, ...): Map<String, Any>`
- `heartbeat(nodeId: String): Map<String, Any>`

#### Service Discovery
- `discoverService(serviceName: String, strategy: String, ...): Map<String, Any>`
- `listServices(): Map<String, Any>`
- `getVersions(serviceName: String): Map<String, Any>`

#### Health & Monitoring
- `getHealth(): Map<String, Any>`
- `getMetrics(): Map<String, Any>`
- `getHealthScores(serviceName: String): Map<String, Any>`
- `predictHealth(serviceName: String, window: Double): Map<String, Any>`
- `getAnomalies(): Map<String, Any>`

#### Traffic Management
- `setTrafficDistribution(serviceName: String, distribution: Map<String, Double>): Map<String, Any>`
- `promoteVersion(serviceName: String, version: String): Map<String, Any>`
- `retireVersion(serviceName: String, version: String): Map<String, Any>`
- `shiftTraffic(serviceName: String, fromVersion: String, toVersion: String, percentage: Double): Map<String, Any>`

#### Configuration
- `setConfig(serviceName: String, key: String, value: Any, ...): Map<String, Any>`
- `getConfig(serviceName: String, key: String, ...): Any`
- `getAllConfigs(serviceName: String, ...): Map<String, Any>`
- `deleteConfig(serviceName: String, key: String, ...): Map<String, Any>`

#### Dependencies
- `addDependency(serviceName: String, dependsOn: String): Map<String, Any>`
- `removeDependency(serviceName: String, dependsOn: String): Map<String, Any>`
- `getDependencies(serviceName: String): Map<String, Any>`
- `getDependents(serviceName: String): Map<String, Any>`
- `getDependencyGraph(): Map<String, Any>`
- `detectCycles(): Map<String, Any>`

#### Analytics
- `recordResponseTime(nodeId: String, responseTime: Double): Map<String, Any>`
- `recordCall(callerService: String, calledService: String): Map<String, Any>`

#### Cache Management
- `clearCache()`

## Requirements

- Kotlin 1.7+
- OkHttp 4.12+
- Gson 2.10+
- Kotlin Coroutines 1.7+

## Dependencies

```gradle
dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.code.gson:gson:2.10.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3") // For Android
}
```

## Error Handling

All suspend functions can throw exceptions that should be handled:

```kotlin
try {
    val result = client.discoverService("my-service")
    // Handle success
} catch (e: IOException) {
    // Handle network error
} catch (e: Exception) {
    // Handle other errors
}
```

## Battery Optimization

For Android, the client is designed to be battery-efficient:

- Uses efficient HTTP client (OkHttp)
- Implements intelligent caching to reduce network calls
- Supports background sync with WorkManager integration
- Minimizes wake locks and background processing

## Thread Safety

The client is thread-safe and can be used from any coroutine context. Cache operations are protected with mutex locks.

## License

MIT License</content>
</xai:function_call">Now, mark Kotlin SDK as completed and run tests. 

<xai:function_call name="todowrite">
<parameter name="todos">[{"content":"Implement Kotlin/Android Client SDK with background sync and battery optimization","status":"completed","priority":"high","id":"implement_kotlin_sdk"}]