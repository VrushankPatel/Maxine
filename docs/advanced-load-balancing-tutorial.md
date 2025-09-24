# Advanced Load Balancing Tutorial

This tutorial demonstrates how to use Maxine's advanced load balancing strategies for optimal service discovery and traffic distribution.

## Overview

Maxine supports multiple load balancing algorithms to distribute traffic across service instances based on different criteria:

- **Round Robin**: Simple rotation through available instances
- **Random**: Random selection for basic load distribution
- **Weighted Random**: Considers instance weights for uneven distribution
- **Least Connections**: Routes to instances with fewer active connections
- **Weighted Least Connections**: Combines connection count with instance weights
- **Consistent Hash**: Ensures requests from the same client go to the same instance
- **IP Hash**: Uses client IP for consistent routing
- **Geo-Aware**: Routes based on geographic proximity
- **Least Response Time**: Selects fastest responding instances
- **Health Score**: Uses comprehensive health metrics for routing
- **Predictive**: Uses time-series analysis for optimal selection
- **AI-Driven**: Uses reinforcement learning for intelligent routing
- **Advanced ML**: Machine learning with predictive analytics
- **Cost-Aware**: Prefers lower-cost infrastructure (on-prem over cloud)
- **Power of Two Choices**: Selects two random instances and picks the better one

## Basic Usage

### JavaScript Client

```javascript
const { MaxineClient } = require('maxine-client');

const client = new MaxineClient('http://localhost:8080');

// Discover with round-robin (default)
const service = await client.discoverServiceLightning('my-service', 'round-robin');

// Discover with consistent hashing for session stickiness
const service = await client.discoverServiceLightning('my-service', 'consistent-hash', 'client-123');

// Discover with geo-aware routing
const service = await client.discoverServiceLightning('my-service', 'geo-aware');
```

### Python Client

```python
from maxine_client import MaxineClient

client = MaxineClient()

# Round-robin discovery
service = client.discover_service_lightning('my-service', strategy='round-robin')

# Consistent hash for sticky sessions
service = client.discover_service_lightning('my-service', strategy='consistent-hash', client_id='client-123')

# Least connections for load balancing
service = client.discover_service_lightning('my-service', strategy='least-connections')
```

## Advanced Strategies

### AI-Driven Load Balancing

Maxine uses reinforcement learning to optimize routing decisions based on real-time metrics:

```javascript
// AI-driven discovery learns from response times and failure rates
const service = await client.discoverServiceLightning('my-service', 'ai-driven');
```

### Predictive Load Balancing

Uses time-series analysis to predict and avoid slow instances:

```javascript
// Predictive strategy uses historical performance data
const service = await client.discoverServiceLightning('my-service', 'predictive');
```

### Cost-Aware Load Balancing

Optimizes for operational costs by preferring on-premise instances:

```javascript
// Cost-aware routing prefers lower-cost infrastructure
const service = await client.discoverServiceLightning('my-service', 'cost-aware');
```

## Service Registration with Weights

For weighted strategies, set weights during registration:

```javascript
// Register with higher weight for more powerful instances
await client.registerServiceLightning('my-service', 'host1', 8080, {
    weight: 3,  // This instance gets 3x more traffic
    tags: ['production', 'high-memory']
});

await client.registerServiceLightning('my-service', 'host2', 8080, {
    weight: 1,  // Normal weight
    tags: ['production']
});
```

## Health-Based Routing

Maxine automatically considers instance health for routing decisions:

```javascript
// Health score considers response times, failure rates, and circuit breaker state
const service = await client.discoverServiceLightning('my-service', 'health-score');
```

## Geographic Load Balancing

For global deployments, use geo-aware routing:

```javascript
// Routes to closest datacenter based on client IP
const service = await client.discoverServiceLightning('my-service', 'geo-aware');
```

## Monitoring Load Balancing Performance

Check load balancing metrics:

```javascript
const metrics = await client.getMetricsLightning();
// View discovery counts by strategy
console.log(metrics.maxine_service_discoveries_total);
```

## Best Practices

1. **Choose the Right Strategy**: Use consistent-hash for stateful services, round-robin for stateless
2. **Monitor Performance**: Regularly check response times and error rates
3. **Use Weights Wisely**: Only apply weights when instances have different capacities
4. **Health Checks**: Ensure proper health check configuration for health-based strategies
5. **Geo-Aware Setup**: Configure proper geographic metadata for global routing

## Configuration

Load balancing strategies can be configured per service or globally. See the main documentation for environment variable configuration options.