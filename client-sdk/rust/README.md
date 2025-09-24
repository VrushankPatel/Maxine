# Maxine Rust Client SDK

A high-performance Rust client for interacting with the Maxine service registry, supporting both Lightning Mode and Full Mode APIs.

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
reqwest = { version = "0.11", features = ["json"] }
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
```

Then include the SDK file in your project.

## Usage

### Lightning Mode (Default)

```rust
use maxine_client::MaxineClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = MaxineClient::new("http://localhost:8080");

    // Register a service with metadata
    let mut metadata = std::collections::HashMap::new();
    metadata.insert("version".to_string(), serde_json::json!("1.0"));
    metadata.insert("weight".to_string(), serde_json::json!(2));

    let node_id = client.register_lightning("my-service", "localhost", 3000, Some(metadata)).await?;
    println!("Registered node: {}", node_id);

    // Discover with load balancing
    let node = client.discover_lightning("my-service", Some("round-robin"), Some("1.0"), None).await?;
    println!("Discovered: {} at {}", node.node_name, node.address);

    // Heartbeat
    let success = client.heartbeat_lightning(&node_id).await?;
    println!("Heartbeat success: {}", success);

    // Get health
    let health = client.health_lightning().await?;
    println!("Health: {:?}", health);

    // Deregister
    client.deregister_lightning(&node_id).await?;

    Ok(())
}
```

### Full Mode

```rust
use maxine_client::MaxineClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = MaxineClient::new("http://localhost:8080").with_api_key("your-api-key");

    // Get all services
    let services = client.services().await?;
    for service in services {
        println!("Service: {}", service.service_name);
    }

    // Get health scores
    let scores = client.health_scores("my-service").await?;
    for score in scores {
        println!("Node {}: score {}", score.node_id, score.score);
    }

    // Get anomalies
    let anomalies = client.anomalies().await?;
    for anomaly in anomalies {
        println!("Anomaly: {} in {}", anomaly.anomaly_type, anomaly.service_name);
    }

    Ok(())
}
```

## Features

- **Lightning Mode Support**: Optimized for high-performance service discovery with minimal overhead
- **Full Mode Support**: Complete feature set including health monitoring, anomalies, and advanced queries
- **API Key Authentication**: Secure access with API key support
- **Async/Await**: Modern async Rust with tokio
- **Load Balancing**: Support for various load balancing strategies
- **Service Versioning**: Version-aware service discovery
- **Metadata Support**: Rich metadata for service instances
- **Health Monitoring**: Real-time health scores and anomaly detection
- **Dependency Management**: Service dependency tracking and cycle detection