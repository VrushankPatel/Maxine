# Event Streaming Tutorial

Maxine provides real-time event streaming capabilities to monitor service registry changes. This tutorial shows how to use WebSocket and MQTT event streaming in your applications.

## WebSocket Event Streaming

### Connecting to WebSocket

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

// Handle connection
ws.on('open', () => {
  console.log('Connected to Maxine WebSocket');
});

// Handle messages
ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log('Event:', event);
});

// Handle errors
ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Handle close
ws.on('close', () => {
  console.log('WebSocket connection closed');
});
```

### Authentication

If authentication is enabled, authenticate after connecting:

```javascript
ws.on('open', () => {
  ws.send(JSON.stringify({
    auth: 'your-jwt-token-here'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  if (message.type === 'authenticated') {
    console.log('Authenticated successfully');
  }
});
```

### Subscribing to Events

Subscribe to specific events or all events:

```javascript
// Subscribe to all events
ws.send(JSON.stringify({
  subscribe: true
}));

// Subscribe to specific service events
ws.send(JSON.stringify({
  subscribe: {
    serviceName: 'my-service'
  }
}));

// Subscribe to specific event types
ws.send(JSON.stringify({
  subscribe: {
    event: 'service_registered'
  }
}));

// Unsubscribe
ws.send(JSON.stringify({
  unsubscribe: true
}));
```

### Event Types

Maxine broadcasts the following event types:

- `service_registered`: When a new service instance is registered
- `service_deregistered`: When a service instance is deregistered
- `service_heartbeat`: When a service sends a heartbeat
- `service_unhealthy`: When a service is removed due to expired heartbeat
- `config_changed`: When service configuration is updated
- `config_deleted`: When service configuration is deleted
- `circuit_open`: When circuit breaker opens
- `circuit_closed`: When circuit breaker closes
- `circuit_half_open`: When circuit breaker enters half-open state

### Event Format

```json
{
  "event": "service_registered",
  "data": {
    "serviceName": "my-service",
    "nodeId": "my-service:localhost:3000"
  },
  "timestamp": 1640995200000
}
```

## MQTT Event Streaming

### Connecting to MQTT

```javascript
const mqtt = require('mqtt');

const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  // Subscribe to events
  client.subscribe('maxine/registry/events/+', (err) => {
    if (!err) {
      console.log('Subscribed to Maxine events');
    }
  });
});

client.on('message', (topic, message) => {
  const event = JSON.parse(message.toString());
  console.log('Topic:', topic);
  console.log('Event:', event);
});
```

### MQTT Topics

Events are published to topics like:
- `maxine/registry/events/service_registered`
- `maxine/registry/events/service_deregistered`
- `maxine/registry/events/circuit_open`

## HTTP Event History API

Retrieve missed events via HTTP:

```javascript
// Get recent events
fetch('http://localhost:8080/events?since=1640995200000&limit=10')
  .then(response => response.json())
  .then(events => {
    events.forEach(event => {
      console.log('Historical event:', event);
    });
  });
```

## Circuit Breaker Monitoring

Monitor circuit breaker states:

```javascript
fetch('http://localhost:8080/circuit-breaker/my-service:localhost:3000')
  .then(response => response.json())
  .then(state => {
    console.log('Circuit state:', state);
    // state: { state: 'closed|open|half-open', failureCount: 0, ... }
  });
```

## Best Practices

1. **Reconnection**: Implement reconnection logic for WebSocket disconnections
2. **Filtering**: Use event filtering to reduce unnecessary messages
3. **Authentication**: Always authenticate WebSocket connections when required
4. **Error Handling**: Handle connection errors and message parsing errors
5. **Resource Management**: Close WebSocket connections when not needed
6. **Rate Limiting**: Be prepared for high event volumes during service churn

## Example Application

Here's a complete example of a monitoring dashboard:

```javascript
const WebSocket = require('ws');
const express = require('express');

const app = express();
const ws = new WebSocket('ws://localhost:8080');

let services = new Map();

ws.on('open', () => {
  ws.send(JSON.stringify({ subscribe: true }));
});

ws.on('message', (data) => {
  const event = JSON.parse(data);
  updateServiceState(event);
  broadcastToClients(event);
});

function updateServiceState(event) {
  const { serviceName, nodeId } = event.data || {};
  if (!serviceName || !nodeId) return;

  if (event.event === 'service_registered') {
    if (!services.has(serviceName)) {
      services.set(serviceName, new Set());
    }
    services.get(serviceName).add(nodeId);
  } else if (event.event === 'service_deregistered') {
    if (services.has(serviceName)) {
      services.get(serviceName).delete(nodeId);
    }
  }
}

// Serve dashboard
app.get('/dashboard', (req, res) => {
  res.json(Object.fromEntries(services));
});

app.listen(3000, () => {
  console.log('Dashboard listening on port 3000');
});
```