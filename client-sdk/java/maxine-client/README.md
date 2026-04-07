# Maxine Java Client

This module contains the Java client source for Maxine.

## Build

```bash
mvn package
```

## Dependency

```xml
<dependency>
    <groupId>io.github.vrushankpatel</groupId>
    <artifactId>maxine-client</artifactId>
    <version>1.0.0</version>
</dependency>
```

## Features

- Sign in and store a bearer token
- Register a service heartbeat
- Start a background heartbeat scheduler for plain Java apps
- Resolve service discovery redirects
- Read and update Maxine config
- Access logs and actuator endpoints

## Usage

```java
MaxineClient client = new MaxineClient("http://localhost:8080");
client.signIn("admin", "admin");
```

Background heartbeat usage:

```java
Map<String, Object> registration = Map.of(
    "hostName", "127.0.0.1",
    "nodeName", "orders-node",
    "serviceName", "orders",
    "port", 8081,
    "ssl", false,
    "timeOut", 10,
    "weight", 1
);

MaxineClient.HeartbeatHandle heartbeat = client.startHeartbeat(registration);
```
