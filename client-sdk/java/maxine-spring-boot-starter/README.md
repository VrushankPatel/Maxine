# Maxine Spring Boot Starter

This module auto-registers a Spring Boot service with Maxine and keeps the
heartbeat running for the lifetime of the application.

## Dependency

```xml
<dependency>
    <groupId>com.maxine</groupId>
    <artifactId>maxine-spring-boot-starter</artifactId>
    <version>1.0.0</version>
</dependency>
```

## Configuration

```properties
spring.application.name=orders-service
server.port=8081

maxine.client.base-url=http://localhost:8080
maxine.client.time-out=10
maxine.client.heartbeat-interval=5s
maxine.client.weight=1
```

Optional overrides:

- `maxine.client.service-name`
- `maxine.client.host-name`
- `maxine.client.node-name`
- `maxine.client.port`
- `maxine.client.ssl`
- `maxine.client.path`
- `maxine.client.enabled`

If `service-name`, `host-name`, `port`, or `path` are omitted, the starter
derives them from Spring Boot defaults where possible.
