# Maxine Rust Client SDK

A Rust client for interacting with the Maxine service registry.

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
maxine-client = { git = "https://github.com/VrushankPatel/Maxine", path = "client-sdk/rust" }
reqwest = { version = "0.11", features = ["json"] }
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
```

## Usage

```rust
use maxine_client::MaxineClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = MaxineClient::new("http://localhost:8080");

    // Register a service
    client.register("my-service", "node-1", "http://localhost:3000").await?;

    // Discover a service
    let node = client.discover("my-service").await?;
    println!("Service address: {}", node.address);

    // Deregister
    client.deregister("my-service", "node-1").await?;

    Ok(())
}
```

## Features

- Service registration
- Service discovery
- Service deregistration