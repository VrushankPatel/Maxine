// Ultra-Fast Mode: Minimal, lightning-fast service registry
// Only core features: register, heartbeat, discover with round-robin/random load balancing
// No logging, metrics, auth, WebSocket, MQTT, gRPC, tracing, etc.
// Pre-allocated buffers, fast JSON, O(1) lookups, zero-copy where possible

const _http = require('http');
const _url = require('url');
const _fs = require('fs');
const path = require('path');

// Fast LCG PRNG for random load balancing
let lcgSeed = Date.now();
const lcgA = 1664525;
const lcgC = 1013904223;
const lcgM = 4294967296;

const fastRandom = () => {
  lcgSeed = (lcgA * lcgSeed + lcgC) % lcgM;
  return lcgSeed / lcgM;
};

// Minimal service registry class
class UltraFastRegistry {
  constructor() {
    this.services = new Map(); // serviceName -> { nodes: Map<nodeName, node>, healthyNodesArray: [], roundRobinIndex: 0 }
    this.lastHeartbeats = new Map(); // nodeName -> timestamp
    this.nodeToService = new Map(); // nodeName -> serviceName
    this.heartbeatTimeout = 30000; // 30 seconds
    this.servicesCount = 0;
    this.nodesCount = 0;
  }

  register(serviceName, nodeInfo) {
    const nodeName = `${nodeInfo.host}:${nodeInfo.port}`;
    const node = {
      ...nodeInfo,
      nodeName,
      address: `${nodeInfo.host}:${nodeInfo.port}`,
      weight: nodeInfo.metadata?.weight || 1,
      connections: 0,
    };

    if (!this.services.has(serviceName)) {
      this.services.set(serviceName, {
        nodes: new Map(),
        healthyNodesArray: [],
        roundRobinIndex: 0,
      });
      this.servicesCount++;
    }

    const service = this.services.get(serviceName);
    if (service.nodes.has(nodeName)) {
      this.lastHeartbeats.set(nodeName, Date.now());
      return nodeName;
    }

    service.nodes.set(nodeName, node);
    service.healthyNodesArray.push(node);
    this.nodeToService.set(nodeName, serviceName);
    this.lastHeartbeats.set(nodeName, Date.now());
    this.nodesCount++;
    return nodeName;
  }

  heartbeat(nodeId) {
    if (this.lastHeartbeats.has(nodeId)) {
      this.lastHeartbeats.set(nodeId, Date.now());
      // Ensure healthy
      const serviceName = this.nodeToService.get(nodeId);
      if (serviceName) {
        const service = this.services.get(serviceName);
        if (service && !service.healthyNodesArray.some((n) => n.nodeName === nodeId)) {
          const node = service.nodes.get(nodeId);
          if (node) service.healthyNodesArray.push(node);
        }
      }
      return true;
    }
    return false;
  }

  deregister(nodeId) {
    const serviceName = this.nodeToService.get(nodeId);
    if (!serviceName) return;
    const service = this.services.get(serviceName);
    if (service) {
      if (service.nodes.has(nodeId)) {
        service.nodes.delete(nodeId);
        const index = service.healthyNodesArray.findIndex((n) => n.nodeName === nodeId);
        if (index !== -1) {
          service.healthyNodesArray.splice(index, 1);
          if (service.roundRobinIndex >= service.healthyNodesArray.length) {
            service.roundRobinIndex = 0;
          }
        }
        this.nodesCount--;
      }
      if (service.nodes.size === 0) {
        this.services.delete(serviceName);
        this.servicesCount--;
      }
    }
    this.lastHeartbeats.delete(nodeId);
    this.nodeToService.delete(nodeId);
  }

  getRandomNode(serviceName, strategy = 'round-robin') {
    const service = this.services.get(serviceName);
    if (!service || service.healthyNodesArray.length === 0) return null;

    const nodes = service.healthyNodesArray;
    if (nodes.length === 0) return null;

    let selectedNode;
    switch (strategy) {
      case 'random':
        const randomIndex = (fastRandom() * nodes.length) | 0;
        selectedNode = nodes[randomIndex];
        break;
      case 'weighted-random':
        let totalWeight = 0;
        for (const node of nodes) {
          totalWeight += node.weight || 1;
        }
        let rand = fastRandom() * totalWeight;
        for (const node of nodes) {
          rand -= node.weight || 1;
          if (rand <= 0) {
            selectedNode = node;
            break;
          }
        }
        if (!selectedNode) selectedNode = nodes[0];
        break;
      case 'least-connections':
        selectedNode = nodes[0];
        let minConn = selectedNode.connections || 0;
        for (let i = 1; i < nodes.length; i++) {
          const conn = nodes[i].connections || 0;
          if (conn < minConn) {
            minConn = conn;
            selectedNode = nodes[i];
          }
        }
        break;
      default: // round-robin
        const index = service.roundRobinIndex || 0;
        selectedNode = nodes[index % nodes.length];
        service.roundRobinIndex = (index + 1) % nodes.length;
    }
    if (selectedNode) {
      selectedNode.connections++;
    }
    return selectedNode;
  }

  cleanup() {
    const now = Date.now();
    const toRemove = [];
    for (const [nodeName, lastBeat] of this.lastHeartbeats) {
      if (now - lastBeat > this.heartbeatTimeout) {
        toRemove.push(nodeName);
      }
    }
    for (const nodeName of toRemove) {
      this.deregister(nodeName);
    }
  }

  getServices() {
    return Array.from(this.services.keys());
  }
}

// Pre-compiled fast JSON stringify
const fastJsonStringify = require('fast-json-stringify');

const registerResponseSchema = {
  type: 'object',
  properties: {
    nodeId: { type: 'string' },
    status: { type: 'string' },
  },
};
const stringifyRegister = fastJsonStringify(registerResponseSchema);

const discoverResponseSchema = {
  type: 'object',
  properties: {
    address: { type: 'string' },
    nodeName: { type: 'string' },
    healthy: { type: 'boolean' },
  },
};
const stringifyDiscover = fastJsonStringify(discoverResponseSchema);

const successResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
  },
};
const stringifySuccess = fastJsonStringify(successResponseSchema);

const serversResponseSchema = {
  type: 'object',
  properties: {
    services: { type: 'array', items: { type: 'string' } },
  },
};
const stringifyServers = fastJsonStringify(serversResponseSchema);

const healthResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    services: { type: 'number' },
    nodes: { type: 'number' },
  },
};
const stringifyHealth = fastJsonStringify(healthResponseSchema);

// Pre-allocated error buffers
const errorMissingServiceName = Buffer.from('{"error": "Missing serviceName"}');
const errorMissingNodeId = Buffer.from('{"error": "Missing nodeId"}');
const errorInvalidJSON = Buffer.from('{"error": "Invalid JSON"}');
const errorNotFound = Buffer.from('{"message": "Not found"}');
const successTrue = Buffer.from('{"success":true}');
const serviceUnavailable = Buffer.from('{"message": "Service unavailable"}');

// Routes map for O(1) lookup
const routes = new Map();

// Create registry
const serviceRegistry = new UltraFastRegistry();

// Handler functions
const handleRegister = (req, res) => {
  try {
    const { serviceName, host, port, metadata } = req.body;
    if (!serviceName || !host || !port) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(errorMissingServiceName);
      return;
    }
    const nodeId = serviceRegistry.register(serviceName, { host, port, metadata });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(stringifyRegister({ nodeId, status: 'registered' }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error": "Internal server error"}');
  }
};

const handleHeartbeat = (req, res) => {
  try {
    const { nodeId } = req.body;
    if (!nodeId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(errorMissingNodeId);
      return;
    }
    const success = serviceRegistry.heartbeat(nodeId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(stringifySuccess({ success }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error": "Internal server error"}');
  }
};

const handleDeregister = (req, res) => {
  try {
    const { nodeId } = req.body;
    if (!nodeId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(errorMissingNodeId);
      return;
    }
    serviceRegistry.deregister(nodeId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(successTrue);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error": "Internal server error"}');
  }
};

const handleDiscover = (req, res) => {
  try {
    const serviceName = req.query.serviceName;
    if (!serviceName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(errorMissingServiceName);
      return;
    }
    const strategy = req.query.loadBalancing || 'round-robin';
    const node = serviceRegistry.getRandomNode(serviceName, strategy);
    if (!node) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(serviceUnavailable);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(stringifyDiscover({ address: node.address, nodeName: node.nodeName, healthy: true }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error": "Internal server error"}');
  }
};

const handleServers = (req, res) => {
  try {
    const services = serviceRegistry.getServices();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(stringifyServers({ services }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error": "Internal server error"}');
  }
};

const handleHealth = (req, res) => {
  try {
    const services = serviceRegistry.servicesCount;
    const nodes = serviceRegistry.nodesCount;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(stringifyHealth({ status: 'ok', services, nodes }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error": "Internal server error"}');
  }
};

routes.set('POST /register', handleRegister);
routes.set('POST /heartbeat', handleHeartbeat);
routes.set('DELETE /deregister', handleDeregister);
routes.set('GET /discover', handleDiscover);
routes.set('GET /servers', handleServers);
routes.set('GET /health', handleHealth);

// Request handler
const requestHandler = (req, res) => {
  try {
    const parsedUrl = _url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;
    const routeKey = `${method} ${pathname}`;
    const handler = routes.get(routeKey);
    if (handler) {
      if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          try {
            req.body = body ? JSON.parse(body) : {};
            req.query = parsedUrl.query;
            handler(req, res);
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(errorInvalidJSON);
          }
        });
      } else {
        req.query = parsedUrl.query;
        req.body = {};
        handler(req, res);
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(errorNotFound);
    }
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error": "Internal server error"}');
  }
};

// Create server
const server = _http.createServer({ keepAlive: false }, requestHandler);

// Periodic cleanup
setInterval(() => serviceRegistry.cleanup(), 30000);

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  // Minimal logging
});

// Keep alive
setInterval(() => {}, 1000);
process.stdin.resume();
