const express = require('express');
const { LRUCache } = require('lru-cache');
const winston = require('winston');

// Simple in-memory service registry
class ServiceRegistry {
  constructor() {
    this.services = new Map(); // serviceName -> Set of nodes
    this.nodes = new Map(); // nodeId -> node info
    this.heartbeats = new Map(); // nodeId -> last heartbeat timestamp
    this.heartbeatTimeout = 30000; // 30 seconds
  }

  register(serviceName, nodeInfo) {
    const nodeId = `${serviceName}:${nodeInfo.host}:${nodeInfo.port}`;

    if (!this.services.has(serviceName)) {
      this.services.set(serviceName, new Set());
    }
    this.services.get(serviceName).add(nodeId);

    this.nodes.set(nodeId, { ...nodeInfo, serviceName, registeredAt: Date.now() });
    this.heartbeats.set(nodeId, Date.now());

    console.log(`Registered ${nodeId}`);
    return nodeId;
  }

  deregister(nodeId) {
    if (this.nodes.has(nodeId)) {
      const serviceName = this.nodes.get(nodeId).serviceName;
      this.services.get(serviceName).delete(nodeId);
      this.nodes.delete(nodeId);
      this.heartbeats.delete(nodeId);
      console.log(`Deregistered ${nodeId}`);
      return true;
    }
    return false;
  }

  discover(serviceName) {
    const serviceNodes = this.services.get(serviceName);
    if (!serviceNodes || serviceNodes.size === 0) return null;

    // Simple round-robin (could be improved)
    const nodes = Array.from(serviceNodes).map(nodeId => this.nodes.get(nodeId)).filter(node => {
      const lastHeartbeat = this.heartbeats.get(`${serviceName}:${node.host}:${node.port}`);
      return lastHeartbeat && (Date.now() - lastHeartbeat) < this.heartbeatTimeout;
    });

    if (nodes.length === 0) return null;

    // Return random node for load balancing
    return nodes[Math.floor(Math.random() * nodes.length)];
  }

  heartbeat(nodeId) {
    if (this.heartbeats.has(nodeId)) {
      this.heartbeats.set(nodeId, Date.now());
      return true;
    }
    return false;
  }

  cleanup() {
    const now = Date.now();
    for (const [nodeId, lastHeartbeat] of this.heartbeats) {
      if (now - lastHeartbeat > this.heartbeatTimeout) {
        this.deregister(nodeId);
      }
    }
  }
}

const registry = new ServiceRegistry();

// Cleanup expired services every 10 seconds
setInterval(() => registry.cleanup(), 10000);

const app = express();
app.use(express.json());

// Register service
app.post('/register', (req, res) => {
  const { serviceName, host, port, metadata } = req.body;
  if (!serviceName || !host || !port) {
    return res.status(400).json({ error: 'Missing serviceName, host, or port' });
  }

  const nodeId = registry.register(serviceName, { host, port, metadata });
  res.json({ nodeId, status: 'registered' });
});

// Deregister service
app.post('/deregister', (req, res) => {
  const { nodeId } = req.body;
  if (!nodeId) {
    return res.status(400).json({ error: 'Missing nodeId' });
  }

  const success = registry.deregister(nodeId);
  res.json({ success });
});

// Heartbeat
app.post('/heartbeat', (req, res) => {
  const { nodeId } = req.body;
  if (!nodeId) {
    return res.status(400).json({ error: 'Missing nodeId' });
  }

  const success = registry.heartbeat(nodeId);
  res.json({ success });
});

// Discover service
app.get('/discover', (req, res) => {
  const { serviceName } = req.query;
  if (!serviceName) {
    return res.status(400).json({ error: 'Missing serviceName' });
  }

  const node = registry.discover(serviceName);
  if (!node) {
    return res.status(404).json({ error: 'Service not found' });
  }

  res.json({
    serviceName,
    address: `${node.host}:${node.port}`,
    metadata: node.metadata
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', services: registry.services.size, nodes: registry.nodes.size });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Maxine Service Registry listening on port ${PORT}`);
});