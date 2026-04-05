# Maxine Java SDK

The Java SDK lives in:

- `client-sdk/java/maxine-client/` for the low-level HTTP client
- `client-sdk/java/maxine-spring-boot-starter/` for Spring Boot auto-registration

It targets the Maxine endpoints that currently exist in this repository:

- `POST /api/maxine/signin`
- `PUT /api/maxine/change-password`
- `POST /api/maxine/serviceops/register`
- `GET /api/maxine/serviceops/discover`
- `GET /api/maxine/serviceops/servers`
- `GET/PUT /api/maxine/control/config`
- `GET /api/logs/*`
- `GET /api/actuator/*`

## Build

```bash
cd client-sdk/java
mvn package
```

## Example

```java
MaxineClient client = new MaxineClient("http://localhost:8080");
client.signIn("admin", "admin");

Map<String, Object> registration = Map.of(
    "hostName", "127.0.0.1",
    "nodeName", "node-a",
    "serviceName", "orders",
    "port", 9000,
    "ssl", false,
    "timeOut", 5,
    "weight", 1
);

client.register(registration);
Optional<String> location = client.discoverLocation("orders", "/health");
```

## Spring Boot starter

Add the starter dependency:

```xml
<dependency>
    <groupId>com.maxine</groupId>
    <artifactId>maxine-spring-boot-starter</artifactId>
    <version>1.0.0</version>
</dependency>
```

Then configure the service in `application.properties`:

```properties
spring.application.name=orders-service
server.port=8081

maxine.client.base-url=http://localhost:8080
maxine.client.time-out=10
maxine.client.heartbeat-interval=5s
maxine.client.weight=1
```

Once the Spring Boot application is ready, the starter will derive the service
metadata, register it with Maxine, and continue sending heartbeats in the
background.
