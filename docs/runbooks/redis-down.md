# Operational Runbook: Redis Down Recovery

## Incident Overview
The Maxine Service Registry is configured to run in `redis` state mode (`MAXINE_REGISTRY_STATE_MODE=redis`) for sharing active service registrations across multiple instances. 
When the Redis instance/cluster is unreachable, node instance synchronization fails.

## Expected System Behavior Under Failure
1. **Cache Fallback (Graceful Degradation)**:
   - When Redis is down, Maxine's `RegistryStateService` detects connection failures.
   - Nodes continue serving traffic from local memory cache state that was loaded/recovered before the drop.
   - Any new service registration (`/api/maxine/serviceops/register`) or discovery lookup will read from and write to the local in-memory registry.
   - However, since Redis is offline, mutations will not synchronize to other instances.

2. **Distributed Leader Election**:
   - The current leader will fail to renew its lease.
   - The leader node transitions back to follower state in memory (`isLeader: false`).
   - Active health checks are suspended on followers (only run by a verified leader).

## Recovery Steps

### 1. Verification
Check if Maxine is logging connection errors:
```bash
grep -i "redis" logs/Maxine-info.log
```
Check if the Redis client is currently attempting connection retries:
- If logs show continuous reconnect attempts, verify Redis status directly.

### 2. Manual Master Promotion (If running Redis Sentinel/Replication)
If your primary Redis node has failed and Sentinel failed to auto-promote a new master:
1. Log into one of your Redis replica nodes.
2. Run:
   ```bash
   redis-cli replicaof no one
   ```
3. Update Maxine configurations (or DNS records) to point to the promoted master:
   ```bash
   export MAXINE_REGISTRY_REDIS_URL="redis://new-master-ip:6379"
   ```
4. Restart the Maxine registry instances:
   ```bash
   npm run start
   ```

### 3. Fallback to Local/Shared-File Mode (Emergency Override)
If Redis is down for an extended period and cannot be restored, change the state mode to local or shared-file to keep service discovery functional:
1. Update environment variables on the Maxine servers:
   ```bash
   export MAXINE_REGISTRY_STATE_MODE="shared-file"
   export MAXINE_REGISTRY_STATE_FILE="/opt/maxine/data/registry-state.json"
   ```
2. Restart the Maxine services.
