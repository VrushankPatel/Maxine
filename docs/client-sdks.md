# Maxine Client SDKs

Maxine provides client SDKs for various programming languages to simplify service discovery and registration. All SDKs support HTTP, UDP, and TCP discovery for maximum performance.

## JavaScript/Node.js SDK

The JavaScript SDK is available in the `client-sdk/` directory.

### Installation

```bash
npm install maxine-client
```

### Usage

```javascript
const MaxineClient = require('maxine-client');

const client = new MaxineClient({
  serverUrl: 'http://localhost:8080',
  serviceName: 'my-service',
  hostName: 'localhost',
  port: 3000
});

// Register service
await client.register();

// Discover service
const node = await client.discover('other-service');
console.log(node.address);

// Close client
client.close();
```

### Features

- Service registration and deregistration
- Service discovery with load balancing
- Health checks
- Caching support
- WebSocket notifications

### WebSocket Event Streaming

The JavaScript SDK supports real-time event streaming via WebSocket for monitoring service registry changes.

```javascript
const MaxineClient = require('maxine-client');

const client = new MaxineClient({
  serverUrl: 'http://localhost:8080'
});

// Connect to WebSocket for event streaming
client.connectWebSocket((event) => {
  console.log('Received event:', event);
});

// Authenticate if required
client.authenticateWebSocket('your-jwt-token');

// Subscribe to specific events
client.subscribeWebSocket({
  event: 'service_registered',
  serviceName: 'my-service'
});

// Close WebSocket connection
client.closeWebSocket();
```

## Python SDK

Located in `client-sdk/python/`.

### Installation

```bash
pip install maxine-client
```

### Usage

```python
from maxine_client import MaxineClient

client = MaxineClient(
    server_url='http://localhost:8080',
    service_name='my-service',
    host_name='localhost',
    port=3000
)

# Register service
client.register()

# Discover service
node = client.discover('other-service')
print(node['address'])

# Close client
client.close()
```

### Features

- Service registration and discovery
- UDP/TCP discovery support
- Built-in LRU caching
- Asynchronous operations

## Go SDK

Located in `client-sdk/go/`.

### Installation

```bash
go get github.com/VrushankPatel/Maxine/client-sdk/go
```

### Usage

```go
package main

import (
    "fmt"
    "github.com/VrushankPatel/Maxine/client-sdk/go/maxine_client"
)

func main() {
    client := maxine_client.NewClient(&maxine_client.Config{
        ServerURL:  "http://localhost:8080",
        ServiceName: "my-service",
        HostName:    "localhost",
        Port:        3000,
    })

    // Register service
    err := client.Register()
    if err != nil {
        panic(err)
    }

    // Discover service
    node, err := client.Discover("other-service")
    if err != nil {
        panic(err)
    }
    fmt.Println(node.Address)

    // Close client
    client.Close()
}
```

### Features

- Service registration and discovery
- UDP/TCP discovery
- Concurrent operations
- Error handling

## Java SDK

Located in `client-sdk/java/`.

### Installation

Add to `pom.xml`:

```xml
<dependency>
    <groupId>com.maxine</groupId>
    <artifactId>maxine-client</artifactId>
    <version>1.0.0</version>
</dependency>
```

### Usage

```java
import com.maxine.MaxineClient;
import com.maxine.MaxineClient.ServiceNode;

public class Example {
    public static void main(String[] args) {
        MaxineClient client = new MaxineClient("http://localhost:8080");

        // Register service
        client.register("my-service", "localhost", 3000);

        // Discover service
        ServiceNode node = client.discover("other-service");
        if (node != null) {
            System.out.println("Address: " + node.getAddress());
        }

        // Close client
        client.close();
    }
}
```

### Features

- Service discovery
- Load balancing
- Error handling
- SLF4J logging

## C# SDK

Located in `client-sdk/csharp/`.

### Installation

```bash
dotnet add package MaxineClient
```

### Usage

```csharp
using MaxineClient;

class Program {
    static void Main() {
        var client = new MaxineClient("http://localhost:8080");

        // Register service
        client.Register("my-service", "localhost", 3000);

        // Discover service
        var node = client.Discover("other-service");
        if (node != null) {
            Console.WriteLine($"Address: {node.Address}");
        }

        // Close client
        client.Close();
    }
}
```

### Features

- Service registration and discovery
- UDP/TCP support
- Asynchronous operations

## Rust SDK

Located in `client-sdk/rust/`.

### Installation

Add to `Cargo.toml`:

```toml
[dependencies]
maxine-client = "1.0.0"
```

### Usage

```rust
use maxine_client::MaxineClient;

fn main() {
    let mut client = MaxineClient::new("http://localhost:8080");

    // Register service
    client.register("my-service", "localhost", 3000);

    // Discover service
    if let Ok(node) = client.discover("other-service") {
        println!("Address: {}", node.address);
    }

    // Close client
    client.close();
}
```

### Features

- Service discovery
- High performance
- Memory safety
- Error handling

## SDK Comparison

| Feature | JS/Node.js | Python | Go | Java | C# | Rust |
|---------|------------|--------|----|------|----|------|
| Registration | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Discovery | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| UDP Discovery | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| TCP Discovery | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Caching | ✓ | ✓ | - | - | - | - |
| WebSocket | ✓ | - | - | - | - | - |
| Async/Await | ✓ | ✓ | ✓ | - | ✓ | - |

## Configuration

All SDKs support the following configuration options:

- `serverUrl`: Maxine server URL
- `serviceName`: Service name for registration
- `hostName`: Host name
- `port`: Port number
- `heartbeatInterval`: Heartbeat interval in seconds (default: 5)
- `timeout`: Request timeout in milliseconds (default: 5000)

## Best Practices

1. Always close the client when done
2. Handle discovery failures gracefully
3. Use appropriate load balancing strategies
4. Enable caching for better performance
5. Monitor service health</content>
</xai:function_call">