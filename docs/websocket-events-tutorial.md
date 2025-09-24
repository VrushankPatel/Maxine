# WebSocket Real-Time Events Tutorial

This tutorial shows how to use Maxine's WebSocket API for real-time service registry event streaming and monitoring.

## Overview

Maxine provides real-time event streaming via WebSocket connections, allowing clients to receive instant notifications about service registry changes, health status updates, and system events.

## Supported Events

- `service_registered`: New service instance registered
- `service_deregistered`: Service instance removed
- `service_heartbeat`: Heartbeat received from instance
- `service_unhealthy`: Instance marked as unhealthy
- `config_changed`: Service configuration updated
- `config_deleted`: Service configuration removed
- `circuit_open`: Circuit breaker opened
- `circuit_closed`: Circuit breaker closed

## JavaScript WebSocket Client

```javascript
const { WebSocketClient } = require('maxine-client');

const wsClient = new WebSocketClient('ws://localhost:8080', jwtToken);

// Register event handlers
wsClient.on('service_registered', (event) => {
    console.log('Service registered:', event.data.serviceName);
    updateServiceList(event.data);
});

wsClient.on('service_deregistered', (event) => {
    console.log('Service deregistered:', event.data.nodeId);
    removeServiceInstance(event.data.nodeId);
});

wsClient.on('service_unhealthy', (event) => {
    console.log('Service unhealthy:', event.data.nodeId);
    markInstanceUnhealthy(event.data.nodeId);
});

// Connect and subscribe
await wsClient.connect();

// Subscribe to all service events
wsClient.subscribe('service_registered');
wsClient.subscribe('service_deregistered');
wsClient.subscribe('service_unhealthy');

// Subscribe to specific service events
wsClient.subscribe('service_registered', 'my-service');
wsClient.subscribe('service_heartbeat', 'api-service');
```

## Python WebSocket Client

```python
from maxine_client import WebSocketClient

def on_service_registered(event):
    print(f"Service registered: {event['data']['serviceName']}")
    update_dashboard(event['data'])

def on_service_down(event):
    print(f"Service down: {event['data']['nodeId']}")
    alert_ops_team(event['data'])

ws_client = WebSocketClient('ws://localhost:8080', jwt_token)

# Register handlers
ws_client.on_event('service_registered', on_service_registered)
ws_client.on_event('service_deregistered', on_service_down)
ws_client.on_event('service_unhealthy', on_service_down)

# Connect
ws_client.connect()

# Subscribe to events
ws_client.subscribe('service_registered')
ws_client.subscribe('service_deregistered', service_name='critical-service')
```

## Authentication

For authenticated connections, include JWT token:

```javascript
const wsClient = new WebSocketClient('ws://localhost:8080', jwtToken);
await wsClient.connect(); // Token sent automatically
```

```python
ws_client = WebSocketClient('ws://localhost:8080', jwt_token)
ws_client.connect()  # Token sent on connection
```

## Event Filtering

Subscribe to specific events and filter by service or node:

```javascript
// Subscribe to all registration events
wsClient.subscribe('service_registered');

// Subscribe only to events for specific service
wsClient.subscribe('service_heartbeat', 'my-api-service');

// Subscribe to events for specific node
wsClient.subscribe('service_unhealthy', null, 'my-service:localhost:3000');
```

## Token Refresh

For long-running connections, refresh tokens:

```javascript
// Refresh token (client-side)
wsClient.refreshToken();

// Server responds with new token
wsClient.on('token_refreshed', (event) => {
    console.log('New token:', event.token);
    // Update stored token
    updateStoredToken(event.token);
});
```

## Error Handling

Handle connection errors and reconnections:

```javascript
wsClient.on('error', (error) => {
    console.error('WebSocket error:', error);
    // Implement reconnection logic
    setTimeout(() => wsClient.connect(), 5000);
});

wsClient.on('close', () => {
    console.log('Connection closed, reconnecting...');
    setTimeout(() => wsClient.connect(), 1000);
});
```

## Real-Time Dashboard Example

Build a live service dashboard:

```javascript
const services = new Map();

function updateDashboard() {
    // Update UI with current services
    renderServiceGrid(services);
}

wsClient.on('service_registered', (event) => {
    const { serviceName, nodeId } = event.data;
    if (!services.has(serviceName)) {
        services.set(serviceName, new Set());
    }
    services.get(serviceName).add(nodeId);
    updateDashboard();
});

wsClient.on('service_deregistered', (event) => {
    const { nodeId } = event.data;
    const serviceName = nodeId.split(':')[0];
    if (services.has(serviceName)) {
        services.get(serviceName).delete(nodeId);
        if (services.get(serviceName).size === 0) {
            services.delete(serviceName);
        }
    }
    updateDashboard();
});

// Subscribe to all service events
wsClient.subscribe('service_registered');
wsClient.subscribe('service_deregistered');
wsClient.subscribe('service_unhealthy');
```

## Circuit Breaker Events

Monitor circuit breaker state changes:

```javascript
wsClient.on('circuit_open', (event) => {
    console.log(`Circuit opened for ${event.data.nodeId}`);
    // Update UI to show degraded service
    showCircuitBreakerAlert(event.data.nodeId);
});

wsClient.on('circuit_closed', (event) => {
    console.log(`Circuit closed for ${event.data.nodeId}`);
    // Update UI to show service recovered
    hideCircuitBreakerAlert(event.data.nodeId);
});

wsClient.subscribe('circuit_open');
wsClient.subscribe('circuit_closed');
```

## Configuration Change Events

Track service configuration updates:

```javascript
wsClient.on('config_changed', (event) => {
    const { serviceName, key, value } = event.data;
    console.log(`Config changed for ${serviceName}: ${key} = ${value}`);
    // Update local config cache
    updateConfigCache(serviceName, key, value);
});

wsClient.subscribe('config_changed');
wsClient.subscribe('config_deleted');
```

## Best Practices

1. **Connection Management**: Implement proper reconnection logic with exponential backoff
2. **Resource Cleanup**: Always disconnect WebSocket connections when not needed
3. **Error Handling**: Handle network errors and authentication failures gracefully
4. **Event Filtering**: Subscribe only to needed events to reduce network traffic
5. **Token Management**: Implement automatic token refresh for long-running connections
6. **UI Updates**: Debounce rapid UI updates to prevent performance issues

## Performance Considerations

- WebSocket connections are lightweight but monitor connection counts
- Use event filtering to reduce unnecessary message processing
- Implement connection pooling for high-traffic applications
- Consider message compression for large event payloads

## Security

- Always use WSS (WebSocket Secure) in production
- Implement proper authentication and authorization
- Validate JWT tokens on connection and refresh
- Use role-based event filtering for sensitive operations