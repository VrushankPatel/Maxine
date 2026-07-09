# Operational Runbook: Upstream Mass-Eviction

## Incident Overview
An "Upstream Mass-Eviction" occurs when multiple backend nodes for a service are simultaneously marked unhealthy and evicted (or demoted) by the active health checking system. This leaves the service registry unable to proxy calls, resulting in `502 Bad Gateway` or `503 Service Unavailable` errors for clients.

## Root Causes
1. **Network Partition**: Maxine leader node loses connectivity to the downstream network where services run, incorrectly marking all upstreams as dead.
2. **Cascading Failure**: Backend services are overloaded, leading to request timeouts on health checks.
3. **Misconfiguration**: Global health check path (`MAXINE_ACTIVE_HEALTH_CHECK_PATH`) is set incorrectly, causing all checks to return 404.

## Remedial Actions

### 1. Verify Global Status
Check the alerts system and audit logs for mass evictions:
```bash
grep -i "upstream.evicted" logs/Maxine-info.log
```
Check if the issue is a network partition on the Maxine leader:
- If a single Maxine instance is evicting everything but client requests can reach backend services directly, it is a local network issue.

### 2. Override Circuit Breaker / Fail-Fast States
If the circuit breakers are OPEN for multiple nodes, client requests will fail-fast with `503 Service Unavailable`.
To reset circuit states:
- Circuit breakers automatically transition to `HALF-OPEN` after the cooloff period (default `10s`).
- If you need to temporarily disable or relax circuit breaker and retry rules, increase thresholds:
  ```bash
  export MAXINE_CIRCUIT_BREAKER_FAILURE_THRESHOLD=10
  export MAXINE_CIRCUIT_BREAKER_COOLOFF_MS=2000
  export MAXINE_PROXY_RETRIES=5
  ```
  Restart Maxine.

### 3. Temporarily Disable Active Health Checking
If active health checks are causing premature evictions during a network blip:
1. Turn off active health checks:
   ```bash
   export MAXINE_ACTIVE_HEALTH_CHECKS_ENABLED=false
   ```
2. Restart Maxine. Services will remain registered and won't be evicted.

### 4. Force Service Recovery (Manual Restore)
If backend nodes have recovered but are stuck in `EVICTED` or `HALF-OPEN` states:
- Re-register the service nodes through their respective deployment triggers or manually:
  ```bash
  curl -X POST -H "Content-Type: application/json" -d '{
    "serviceName": "your-service",
    "nodeName": "node-1",
    "address": "http://node-ip:port",
    "weight": 3
  }' http://maxine-registry-ip:8080/api/maxine/serviceops/register
  ```
- This will instantly restore the node to healthy status at full weight.
