# Monitoring and Alerting Guide

This guide covers comprehensive monitoring and alerting setup for Maxine service registry in production environments.

## Overview

Maxine provides extensive monitoring capabilities including metrics collection, health checks, dashboards, and alerting integrations.

## Metrics Collection

### Prometheus Metrics

Maxine exposes Prometheus-compatible metrics on port 9464 at `/metrics`:

```bash
curl http://localhost:9464/metrics
```

Available metrics include:

- `maxine_service_registrations_total`: Total service registrations
- `maxine_service_discoveries_total{service_name, strategy}`: Service discoveries by strategy
- `maxine_service_heartbeats_total`: Total heartbeat operations
- `maxine_service_deregistrations_total`: Total service deregistrations
- `maxine_cache_hits_total`: Cache hit count
- `maxine_cache_misses_total`: Cache miss count
- `maxine_services_active`: Number of active services
- `maxine_nodes_active`: Number of active nodes
- `maxine_circuit_breakers_open`: Number of open circuit breakers
- `maxine_response_time_seconds{operation}`: Response time histograms

### Application Metrics

Additional metrics available at `/metrics` endpoint:

```json
{
  "uptime": 3600000,
  "requests": 15420,
  "errors": 23,
  "services": 12,
  "nodes": 45,
  "persistenceEnabled": true,
  "persistenceType": "file",
  "wsConnections": 8,
  "eventsBroadcasted": 2341,
  "cacheHits": 15234,
  "cacheMisses": 186
}
```

## Health Checks

### Basic Health Check

```bash
curl http://localhost:8080/health
```

Response:
```json
{
  "status": "healthy",
  "services": 12,
  "nodes": 45,
  "federationPeers": 2,
  "cacheStatus": "healthy"
}
```

### Service-Specific Health

```bash
curl http://localhost:8080/health?serviceName=my-service
```

### Circuit Breaker Status

```bash
curl http://localhost:8080/circuit-breaker/my-service:localhost:3000
```

## Dashboards

### Built-in Dashboard

Access the monitoring dashboard at `/dashboard`:

```bash
open http://localhost:8080/dashboard
```

Features:
- Real-time metrics updates via WebSocket
- Service topology visualization
- Cache performance charts
- Recent events feed
- Connection status indicators

### Grafana Integration

Create a Grafana dashboard using Prometheus metrics:

```yaml
# Example Grafana panel for response times
{
  "targets": [
    {
      "expr": "histogram_quantile(0.95, rate(maxine_response_time_seconds_bucket{operation=\"discover\"}[5m]))",
      "legendFormat": "P95 Discovery Latency"
    }
  ]
}
```

## Alerting

### Prometheus Alerting Rules

Example alerting rules for Maxine:

```yaml
groups:
- name: maxine
  rules:
  - alert: MaxineHighErrorRate
    expr: rate(maxine_service_discoveries_total[5m]) / rate(maxine_service_discoveries_total[5m]) > 0.05
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High error rate in Maxine service discovery"
      description: "Error rate is {{ $value }}%"

  - alert: MaxineServiceDown
    expr: maxine_services_active < 1
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "No active services in Maxine registry"
      description: "Maxine has {{ $value }} active services"

  - alert: MaxineHighCircuitBreakers
    expr: maxine_circuit_breakers_open > 5
    for: 2m
    labels:
      severity: warning
    annotations:
      summary: "High number of open circuit breakers"
      description: "{{ $value }} circuit breakers are open"
```

### Webhook Alerts

Configure webhooks for real-time alerts:

```bash
curl -X POST http://localhost:8080/api/maxine/serviceops/webhooks/add \
  -H "Content-Type: application/json" \
  -d '{
    "serviceName": "critical-service",
    "url": "https://alerts.example.com/webhook"
  }'
```

### Slack Integration

Example webhook payload handler for Slack:

```javascript
const express = require('express');
const app = express();

app.post('/webhook', express.json(), (req, res) => {
  const { event, data } = req.body;

  if (event === 'service_unhealthy') {
    // Send Slack alert
    sendSlackMessage({
      channel: '#alerts',
      text: `🚨 Service ${data.nodeId} is unhealthy`,
      attachments: [{
        color: 'danger',
        fields: [
          { title: 'Service', value: data.serviceName, short: true },
          { title: 'Node', value: data.nodeId, short: true },
          { title: 'Timestamp', value: new Date(data.timestamp).toISOString(), short: true }
        ]
      }]
    });
  }

  res.sendStatus(200);
});
```

## Anomaly Detection

### Built-in Anomalies

Get detected anomalies:

```bash
curl http://localhost:8080/anomalies
```

Response:
```json
{
  "anomalies": [
    {
      "serviceName": "api-service",
      "type": "high_response_time",
      "value": 2500,
      "threshold": 1500,
      "severity": "medium"
    }
  ]
}
```

### Predictive Health Monitoring

Get health predictions:

```bash
curl http://localhost:8080/predict-health?serviceName=my-service&window=300000
```

## Log Aggregation

### Winston Logging

Maxine uses Winston for structured logging. Configure log shipping:

```javascript
// Example log shipping to ELK stack
const winston = require('winston');
const Elasticsearch = require('winston-elasticsearch');

const logger = winston.createLogger({
  transports: [
    new Elasticsearch({
      level: 'info',
      indexPrefix: 'maxine-logs',
      clientOpts: {
        node: 'http://elasticsearch:9200'
      }
    })
  ]
});
```

### Log Levels

Configure log levels via environment:

```bash
LOG_LEVEL=info npm start
```

Available levels: error, warn, info, debug

## Performance Monitoring

### Load Testing

Use the built-in load testing:

```bash
npm run load-test
```

### Custom Monitoring Scripts

```javascript
const { MaxineClient } = require('maxine-client');

async function monitorPerformance() {
  const client = new MaxineClient();

  setInterval(async () => {
    try {
      const metrics = await client.getMetrics();

      // Check performance thresholds
      if (metrics.requests > 10000) {
        console.warn('High request volume detected');
      }

      // Monitor cache efficiency
      const cacheHitRate = metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses);
      if (cacheHitRate < 0.8) {
        console.warn(`Low cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%`);
      }

    } catch (error) {
      console.error('Monitoring error:', error);
    }
  }, 30000); // Check every 30 seconds
}

monitorPerformance();
```

## Federation Monitoring

### Federation Status

Check federation health:

```bash
curl http://localhost:8080/api/maxine/serviceops/federation/status
```

### Cross-Cluster Metrics

Monitor replication lag and failover status across federated instances.

## Best Practices

1. **Monitor Key Metrics**: Focus on response times, error rates, and service counts
2. **Set Up Alerts**: Configure alerts for critical conditions (service down, high errors)
3. **Use Dashboards**: Create comprehensive dashboards for at-a-glance monitoring
4. **Log Aggregation**: Centralize logs for troubleshooting and analysis
5. **Health Checks**: Implement regular health checks in load balancers
6. **Anomaly Detection**: Use built-in anomaly detection for proactive monitoring
7. **Federation Monitoring**: Monitor federation status in multi-cluster deployments

## Integration Examples

### ELK Stack

```yaml
# Filebeat configuration for Maxine logs
filebeat.inputs:
- type: log
  paths:
    - /app/logs/*.log
  processors:
  - decode_json_fields:
      fields: ["message"]
      target: "maxine"

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "maxine-%{+yyyy.MM.dd}"
```

### Grafana Dashboard

Import this dashboard JSON for comprehensive Maxine monitoring:

```json
{
  "dashboard": {
    "title": "Maxine Service Registry",
    "panels": [
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(maxine_response_time_seconds_bucket[5m]))",
            "legendFormat": "P95 Latency"
          }
        ]
      },
      {
        "title": "Active Services",
        "type": "singlestat",
        "targets": [
          {
            "expr": "maxine_services_active",
            "legendFormat": "Services"
          }
        ]
      }
    ]
  }
}
```

This monitoring setup provides comprehensive observability for Maxine in production environments.