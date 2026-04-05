# Maxine Go Client

The Go SDK provides a typed HTTP client for the current Maxine API plus a
background heartbeat helper.

## Usage

```go
package main

import (
    "fmt"
    "log"

    maxine "github.com/VrushankPatel/Maxine/client-sdk/go"
)

func main() {
    client := maxine.NewClient("http://localhost:8080")

    if _, err := client.SignIn("admin", "admin"); err != nil {
        log.Fatal(err)
    }

    registration := map[string]any{
        "hostName":    "127.0.0.1",
        "nodeName":    "orders-node",
        "serviceName": "orders-service",
        "port":        8081,
        "ssl":         false,
        "timeOut":     10,
        "weight":      1,
    }

    if _, err := client.Register(registration); err != nil {
        log.Fatal(err)
    }

    discovery, err := client.DiscoverLocation("orders-service", "/health")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(discovery.Location)
}
```
