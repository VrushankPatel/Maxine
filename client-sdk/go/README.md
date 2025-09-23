# Maxine Go Client SDK

A Go client for interacting with the Maxine service registry.

## Installation

```bash
go get github.com/VrushankPatel/Maxine/client-sdk/go
```

## Usage

```go
package main

import (
	"fmt"
	"github.com/VrushankPatel/Maxine/client-sdk/go"
)

func main() {
	client := maxine.NewMaxineClient("http://localhost:8080")

	// Register a service
	payload := maxine.RegisterPayload{
		ServiceName: "my-service",
		NodeName:    "node-1",
		HostName:    "localhost",
		Port:        3000,
		Weight:      1,
		Metadata:    map[string]interface{}{"env": "prod"},
	}
	err := client.Register(payload)
	if err != nil {
		fmt.Println("Error registering:", err)
		return
	}

	// Discover a service
	node, err := client.Discover("my-service")
	if err != nil {
		fmt.Println("Error discovering:", err)
		return
	}
	fmt.Printf("Discovered node: %s at %s\n", node.NodeName, node.Address)

	// Send heartbeat
	client.SendHeartbeat(payload)
}
```