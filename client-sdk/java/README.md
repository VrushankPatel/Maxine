# Maxine Java Client

Java client library for Maxine service registry and discovery.

## Installation

Add the following dependency to your `pom.xml`:

```xml
<dependency>
    <groupId>com.maxine</groupId>
    <artifactId>maxine-client</artifactId>
    <version>1.0.0</version>
</dependency>
```

## Usage

```java
import com.maxine.MaxineClient;
import com.maxine.MaxineClient.ServiceNode;

// Create client
MaxineClient client = new MaxineClient("http://localhost:8080");

// Discover service
ServiceNode node = client.discover("my-service");
if (node != null) {
    System.out.println("Service address: " + node.getAddress());
    System.out.println("Node name: " + node.getNodeName());
}

// Close client
client.close();
```

## Features

- Service discovery
- Caching support
- Error handling
- Logging with SLF4J

## API

### MaxineClient

- `discover(serviceName)`: Discover a service node
- `discover(serviceName, namespace, version, proxy)`: Discover with parameters
- `close()`: Close the client

### ServiceNode

- `getAddress()`: Get service address
- `getNodeName()`: Get node name