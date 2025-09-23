# Maxine C# Client

C# client library for Maxine service registry and discovery.

## Installation

Add the MaxineClient.cs file to your project.

## Usage

```csharp
using Maxine;

// Create client
using var client = new MaxineClient("http://localhost:8080");

// Discover service
var node = await client.DiscoverAsync("my-service");
if (node != null)
{
    Console.WriteLine($"Service address: {node.Address}");
    Console.WriteLine($"Node name: {node.NodeName}");
}
```

## Features

- Service discovery
- Async/await support
- Error handling
- JSON serialization with System.Text.Json

## API

### MaxineClient

- `DiscoverAsync(serviceName)`: Discover a service node
- `DiscoverAsync(serviceName, namespace, version, proxy)`: Discover with parameters

### ServiceNode

- `Address`: Get service address
- `NodeName`: Get node name</content>
</xai:function_call">  