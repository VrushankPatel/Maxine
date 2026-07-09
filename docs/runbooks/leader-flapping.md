# Operational Runbook: Leader Flapping

## Incident Overview
"Leader Flapping" occurs when the leadership lease alternates rapidly between multiple Maxine instances. This can lead to double active health checks, split-brain routing states, and general consensus instability.

## Root Cause Analysis
1. **Network Jitter / Latency**: Heartbeats to Redis are delayed, causing other instances to assume the leader has crashed and take over.
2. **CPU Starvation**: Under heavy CPU loads, the Node.js event loop is blocked, causing the lease renewal tick interval to run late and fail.

## Remedial Actions & Tuning

### 1. Identify Flapping Instances
Examine the Maxine audit logs for `cluster.leadership_changed` events:
```bash
grep -i "leader" logs/Maxine-info.log
```
If you see frequent alternate assignments:
`【INFO】 - 【GENERIC】 | "Leadership status: {"isLeader":true,...}"`

### 2. Increase Lease Time and Heartbeat Buffers
If the network is unstable or latency is high, tune the lease parameters:
1. Increase the lease lifetime (`MAXINE_LEADER_ELECTION_LEASE_MS`, default `10000` / 10s).
2. Tune the renewal heartbeat interval (`MAXINE_LEADER_ELECTION_RENEW_MS`, default `3000` / 3s).

Ensure the ratio of `LEASE_MS` to `RENEW_MS` is at least **3:1** to allow for 2 failed heartbeat attempts before a lease is lost.

To apply:
```bash
export MAXINE_LEADER_ELECTION_LEASE_MS=15000
export MAXINE_LEADER_ELECTION_RENEW_MS=4000
```
Restart all Maxine instances to apply the configuration.

### 3. Check Event Loop Delays
If network latency is normal, verify Node.js event loop blocks. Under extreme load, use Node.js APM tools or performance profiling to find blocked operations.
