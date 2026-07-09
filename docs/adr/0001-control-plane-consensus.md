# ADR 0001: Control Plane Consensus Coordination

## Status
Proposed

## Context
Maxine supports multiple registry state modes: local memory, shared files, and Redis-backed state. In Redis-backed state mode, leader election is used to coordinate writes and active health checks. Currently, leadership is coordinated via a lease-based lock in Redis using a fencing token.

This design introduces a **split-brain window** where multiple instances could temporarily believe they are the leader (e.g., due to network partitions, Redis connection dropouts, GC pauses, or clock drift). During this window, concurrent mutations could conflict or duplicate work.

We must evaluate whether to upgrade Maxine's coordination to a strong consensus mechanism (e.g., Raft/etcd) or maintain the eventually consistent Redis lease model.

## Alternatives Considered

### Option 1: Migrate to Raft / etcd Consensus
Migrate the control plane to use a consensus protocol like Raft (using a library like `raft-js` or integrating with etcd/Consul).

*   **Pros:**
    *   Strict serializability and strong consistency guarantees.
    *   Zero split-brain window; election safety is mathematically guaranteed.
    *   Robust against clock drift and arbitrary network partitions.
*   **Cons:**
    *   Significantly higher operational and architectural complexity.
    *   Requires deploying and maintaining an etcd/Consul cluster, or managing persistent storage for a custom Raft implementation.
    *   Node.js Raft implementations are less mature and harder to maintain compared to native Go/Rust control planes.

### Option 2: Retain Redis-Lease Coordination with Fencing
Retain the existing Redis-based lease-election mechanism but harden it with fencing tokens and document the split-brain boundaries.

*   **Pros:**
    *   Simple, lightweight, and zero-dependency setup for non-clustered environments.
    *   Reuses the existing Redis deployment without requiring extra operational components.
    *   Sufficient for service registry use cases where eventual consistency (`AP` in CAP theorem) is highly preferred over absolute consistency (`CP`).
*   **Cons:**
    *   Operators must tolerate a brief split-brain window during leader failovers.
    *   Mutations are eventually consistent, requiring client-side resilience.

## Decision
We will **Option 2: Retain Redis-Lease Coordination with Fencing** and formally define Maxine as an **AP (eventually consistent, highly available) service registry**.

For service registries, availability is paramount: a temporary split-brain or stale read is vastly preferable to a service discovery outage. To mitigate write conflicts, we will enforce fencing tokens on all state modifications.

## Consequences
1.  **Eventual Consistency:** Clients must tolerate brief periods of stale discovery records.
2.  **Fencing Tokens:** Every state change must check the current fencing token in Redis to prevent out-of-order mutations.
3.  **Documentation:** The split-brain window must be explicitly documented in the roadmap and runbooks.
