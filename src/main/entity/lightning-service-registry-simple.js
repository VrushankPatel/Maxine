// Lightning-fast service registry for minimal overhead in lightning mode
const config = require('../config/config');
const HashRing = require('hashring');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const axios = require('axios');
const geoip = require('geoip-lite');
const { LRUCache } = require('lru-cache');
const { trace } = require('@opentelemetry/api');

// Fast LCG PRNG for random load balancing
let lcgSeed = Date.now();
const lcgA = 1664525;
const lcgC = 1013904223;
const lcgM = 4294967296;

const fastRandom = () => {
    lcgSeed = (lcgA * lcgSeed + lcgC) % lcgM;
    return lcgSeed / lcgM;
};

class LightningServiceRegistrySimple extends EventEmitter {
    constructor() {
        super();
        this.services = new Map(); // serviceName -> { nodes: Map<nodeName, node>, healthyNodesArray: [], roundRobinIndex: 0 }
        this.lastHeartbeats = new Map(); // nodeName -> timestamp
        this.nodeToService = new Map(); // nodeName -> serviceName
        this.heartbeatTimeout = 30000; // 30 seconds

        // Cached counts for performance
        this.servicesCount = 0;
        this.nodesCount = 0;

        // Configuration management
        this.configurations = new Map(); // serviceName -> Map<key, {value, version, metadata, updatedAt}>

        // Traffic distribution for canary deployments
        this.trafficDistribution = new Map(); // serviceName -> { version: percentage }

        // Service dependencies
        this.dependencies = new Map(); // serviceName -> Set of services it depends on
        this.dependents = new Map(); // serviceName -> Set of services that depend on it

        // Access Control Lists
        this.acls = new Map(); // serviceName -> { allow: Set, deny: Set }

        // Service Intentions
        this.intentions = new Map(); // source:destination -> action ('allow' | 'deny')

        // Service Blacklist
        this.blacklistedServices = new Set();

        // Circuit Breaker
        this.circuitFailures = new Map(); // nodeName -> failure count
        this.circuitState = new Map(); // nodeName -> 'closed' | 'open' | 'half-open'
        this.circuitLastFailure = new Map(); // nodeName -> timestamp
        this.circuitNextTry = new Map(); // nodeName -> timestamp for next retry
        this.circuitBreakerThreshold = config.circuitBreakerFailureThreshold || 5;
        this.circuitBreakerTimeout = config.circuitBreakerTimeout || 60000;
        this.circuitBreakerRetryDelay = 1000; // initial retry delay 1s
        this.circuitBreakerMaxRetryDelay = 30000; // max 30s

        // LRU Cache for discovery results (10k entries, 30s TTL)
        this.discoveryCache = new LRUCache({ max: 10000, ttl: 30000 });

        // Cache metrics
        this.cacheHits = 0;
        this.cacheMisses = 0;

        // Response time tracking for predictive load balancing
        this.responseTimes = new Map(); // nodeName -> { count, sum, average }
        this.responseTimeHistory = new Map(); // nodeName -> [{timestamp, responseTime}, ...] (last 100 entries)
        this.timeWindow = 300000; // 5 minutes for historical data

        // Health scores for nodes (0-100, higher better)
        this.healthScores = new Map(); // nodeName -> score

        // Method to invalidate discovery cache for a service
        this.invalidateDiscoveryCache = (serviceName) => {
            // Since keys start with serviceName, we can iterate and delete
            for (const key of this.discoveryCache.keys()) {
                if (key.startsWith(serviceName + ':')) {
                    this.discoveryCache.delete(key);
                }
            }
        };

        // Persistence
        this.persistenceEnabled = config.persistenceEnabled;
        this.persistenceType = config.persistenceType;
        this.registryFile = path.join(process.cwd(), 'registry.json');
        this.savePending = false;
        this.saveTimeout = null;
        this.mmapBuffer = null;
        this.mmapSize = 1024 * 1024 * 10; // 10MB initial size

        if (this.persistenceEnabled) {
            this.loadRegistry();
            if (this.persistenceType === 'redis') {
                this.initRedis();
            } else if (this.persistenceType === 'mmap') {
                this.initMemoryMapped();
            } else if (this.persistenceType === 'shm') {
                this.initSharedMemory();
            }
        }

        // Periodic cleanup
        setInterval(() => this.cleanup(), config.cleanupInterval);
    }

    cleanup() {
        const now = Date.now();
        const timeoutMs = this.heartbeatTimeout;
        const toRemove = [];
        const affectedServices = new Set();
        for (const [nodeName, lastBeat] of this.lastHeartbeats) {
            if (now - lastBeat > timeoutMs) {
                toRemove.push(nodeName);
            }
        }
        // Remove expired nodes
        for (const nodeName of toRemove) {
            this.lastHeartbeats.delete(nodeName);
            const serviceName = this.nodeToService.get(nodeName);
            if (serviceName) {
                affectedServices.add(serviceName);
                const service = this.services.get(serviceName);
                if (service) {
                    service.nodes.delete(nodeName);
                    // Remove from healthyNodesArray
                    const index = service.healthyNodesArray.findIndex(n => n.nodeName === nodeName);
                    if (index !== -1) {
                        service.healthyNodesArray.splice(index, 1);
                        if (service.roundRobinIndex >= service.healthyNodesArray.length) {
                            service.roundRobinIndex = 0;
                        }
                    }
                    if (service.nodes.size === 0) {
                        this.services.delete(serviceName);
                        this.servicesCount--;
                    }
                }
                this.nodeToService.delete(nodeName);
                this.nodesCount--;
                if (global.broadcast) global.broadcast('service_unhealthy', { nodeId: nodeName });
            }
        }
        // Invalidate cache for affected services
        for (const serviceName of affectedServices) {
            this.invalidateDiscoveryCache(serviceName);
        }
        // Update health scores periodically
        this.updateAllHealthScores();
        if (toRemove.length > 0) {
            this.saveRegistry();
        }
    }

    register(serviceName, nodeInfo) {
        const tracer = trace.getTracer('maxine-registry-simple', '1.0.0');
        return tracer.startActiveSpan('register', (span) => {
            span.setAttribute('service.name', serviceName);
            span.setAttribute('node.host', nodeInfo.host);
            span.setAttribute('node.port', nodeInfo.port);

            try {
                if (this.isBlacklisted(serviceName)) {
                    throw new Error(`Service ${serviceName} is blacklisted`);
                }
                const nodeName = `${nodeInfo.host}:${nodeInfo.port}`;
                const weight = nodeInfo.metadata && nodeInfo.metadata.weight ? parseInt(nodeInfo.metadata.weight) : 1;
        const version = nodeInfo.metadata && nodeInfo.metadata.version ? nodeInfo.metadata.version : null;
        const fullServiceName = version ? `${serviceName}:${version}` : serviceName;
        const node = { ...nodeInfo, nodeName, address: `${nodeInfo.host}:${nodeInfo.port}`, weight, connections: 0 };

        if (!this.services.has(fullServiceName)) {
            this.services.set(fullServiceName, { nodes: new Map(), healthyNodesArray: [], roundRobinIndex: 0 });
            this.servicesCount++;
        }
        const service = this.services.get(fullServiceName);
                if (service.nodes.has(nodeName)) {
                    // Already registered, just update heartbeat
                    this.lastHeartbeats.set(nodeName, Date.now());
                    span.end();
                    return nodeName;
                }
        service.nodes.set(nodeName, node);
        service.healthyNodesArray.push(node);
        this.nodeToService.set(nodeName, fullServiceName);
        this.lastHeartbeats.set(nodeName, Date.now());
        this.nodesCount++;

                this.saveRegistry();
                this.invalidateDiscoveryCache(fullServiceName);
                if (global.broadcast) global.broadcast('service_registered', { serviceName: fullServiceName, nodeId: nodeName });
                // Replicate to federation peers
                this.replicateRegistration(fullServiceName, node);
                span.end();
                return nodeName;
            } catch (error) {
                span.recordException(error);
                span.setStatus({ code: 2, message: error.message });
                span.end();
                throw error;
            }
        });
    }

    deregister(nodeId) {
        const serviceName = this.nodeToService.get(nodeId);
        if (!serviceName) return;
        const service = this.services.get(serviceName);
        if (service) {
            if (service.nodes.has(nodeId)) {
                service.nodes.delete(nodeId);
                // Remove from healthyNodesArray
                const index = service.healthyNodesArray.findIndex(n => n.nodeName === nodeId);
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
        this.saveRegistry();
        this.invalidateDiscoveryCache(serviceName);
        if (global.broadcast) global.broadcast('service_deregistered', { nodeId });
        // Replicate to federation peers
        this.replicateDeregistration(nodeId);
    }

    heartbeat(nodeId) {
        if (this.lastHeartbeats.has(nodeId)) {
            this.lastHeartbeats.set(nodeId, Date.now());
            // If not in healthy, add it back
            const serviceName = this.nodeToService.get(nodeId);
            if (serviceName) {
                const service = this.services.get(serviceName);
                if (service && !service.healthyNodesArray.some(n => n.nodeName === nodeId)) {
                    const node = service.nodes.get(nodeId);
                    if (node) service.healthyNodesArray.push(node);
                }
            }
            // if (global.broadcast) global.broadcast('service_heartbeat', { nodeId });
            return true;
        }
        return false;
    }

    getRandomNode(serviceName, strategy = 'round-robin', clientIP = null, tags = null, version = null) {
        const tracer = trace.getTracer('maxine-registry-simple', '1.0.0');
        return tracer.startActiveSpan('getRandomNode', (span) => {
            span.setAttribute('service.name', serviceName);
            span.setAttribute('strategy', strategy);
            span.setAttribute('client.ip', clientIP || '');
            span.setAttribute('tags', tags ? tags.join(',') : '');
            span.setAttribute('version', version || '');

            try {
                let fullServiceName = serviceName;
                if (version) {
                    if (version === 'latest') {
                        const latest = this.getLatestVersion(serviceName);
                        if (latest) {
                            fullServiceName = `${serviceName}:${latest}`;
                        }
                    } else {
                        fullServiceName = `${serviceName}:${version}`;
                    }
                }

        // Check cache for deterministic strategies
        const cacheableStrategies = ['consistent-hash', 'ip-hash', 'geo-aware', 'least-response-time', 'health-score'];
        if (cacheableStrategies.includes(strategy)) {
            const cacheKey = `${fullServiceName}:${strategy}:${clientIP || 'default'}:${tags ? tags.sort().join(',') : ''}`;
            const cached = this.discoveryCache.get(cacheKey);
            if (cached) {
                this.cacheHits++;
                return cached;
            } else {
                this.cacheMisses++;
            }
        }

        const service = this.services.get(fullServiceName);
        if (!service || service.healthyNodesArray.length === 0) return null;

        // Filter out nodes with open circuit breakers
        let availableNodes = service.healthyNodesArray.filter(node => !this.isCircuitOpen(node.nodeName));

        // Filter by tags if provided
        if (tags && tags.length > 0) {
            availableNodes = availableNodes.filter(node => {
                return node.metadata && node.metadata.tags && tags.every(tag => node.metadata.tags.includes(tag));
            });
        }

                if (availableNodes.length === 0) {
                    span.end();
                    return null;
                }

        let selectedNode;
        switch (strategy) {
            case 'random':
                const randomIndex = (fastRandom() * availableNodes.length) | 0;
                selectedNode = availableNodes[randomIndex];
                break;
            case 'weighted-random':
                selectedNode = this.selectWeightedRandom(availableNodes);
                break;
            case 'least-connections':
                selectedNode = this.selectLeastConnections(availableNodes);
                break;
            case 'weighted-least-connections':
                selectedNode = this.selectWeightedLeastConnections(availableNodes);
                break;
            case 'consistent-hash':
                selectedNode = this.selectConsistentHash(availableNodes, clientIP || 'default');
                break;
            case 'ip-hash':
                selectedNode = this.selectIPHash(availableNodes, clientIP);
                break;
             case 'geo-aware':
                 selectedNode = this.selectGeoAware(availableNodes, clientIP);
                 break;
              case 'least-response-time':
                  selectedNode = this.selectLeastResponseTime(availableNodes);
                  break;
              case 'health-score':
                  selectedNode = this.selectHealthScore(availableNodes);
                  break;
             default: // round-robin
                let index = service.roundRobinIndex || 0;
                selectedNode = availableNodes[index % availableNodes.length];
                service.roundRobinIndex = (index + 1) % availableNodes.length;
        }
        if (selectedNode) {
            selectedNode.connections++; // Increment for least-connections
        }

                // Cache the result for cacheable strategies
                if (cacheableStrategies.includes(strategy) && selectedNode) {
                    const cacheKey = `${fullServiceName}:${strategy}:${clientIP || 'default'}:${tags ? tags.sort().join(',') : ''}`;
                    this.discoveryCache.set(cacheKey, selectedNode);
                }

                span.end();
                return selectedNode;
            } catch (error) {
                span.recordException(error);
                span.setStatus({ code: 2, message: error.message });
                span.end();
                throw error;
            }
        });
    }

    selectWeightedRandom(nodes) {
        const totalWeight = nodes.reduce((sum, node) => sum + node.weight, 0);
        let random = fastRandom() * totalWeight;
        for (const node of nodes) {
            random -= node.weight;
            if (random <= 0) return node;
        }
        return nodes[0];
    }

    selectLeastConnections(nodes) {
        return nodes.reduce((min, node) => node.connections < min.connections ? node : min);
    }

    selectWeightedLeastConnections(nodes) {
        // Select node with lowest connections per weight (higher weight can handle more connections)
        let bestNode = null;
        let bestScore = Infinity;
        for (const node of nodes) {
            const score = node.connections / node.weight;
            if (score < bestScore) {
                bestScore = score;
                bestNode = node;
            }
        }
        return bestNode;
    }

    selectConsistentHash(nodes, key) {
        const ring = new HashRing(nodes.map(n => n.nodeName));
        const selected = ring.get(key);
        return nodes.find(n => n.nodeName === selected);
    }

    selectIPHash(nodes, ip) {
        if (!ip) return nodes[0];
        let hash = 0;
        for (let i = 0; i < ip.length; i++) {
            hash = ((hash << 5) - hash) + ip.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }
        const index = Math.abs(hash) % nodes.length;
        return nodes[index];
    }

    selectGeoAware(nodes, clientIP) {
        if (!clientIP) return nodes[0];
        const clientGeo = geoip.lookup(clientIP);
        if (!clientGeo) return nodes[0];
        const clientLat = clientGeo.ll[0];
        const clientLon = clientGeo.ll[1];

        let closestNode = null;
        let minDistance = Infinity;

        for (const node of nodes) {
            // Assume node has location in metadata: { lat: number, lon: number }
            const meta = node.metadata || {};
            if (meta.lat !== undefined && meta.lon !== undefined) {
                const distance = this.haversineDistance(clientLat, clientLon, meta.lat, meta.lon);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestNode = node;
                }
            }
        }

        // If no node has location, fall back to random
        return closestNode || nodes[(fastRandom() * nodes.length) | 0];
    }

    selectLeastResponseTime(nodes) {
        let bestNode = null;
        let bestAverage = Infinity;
        for (const node of nodes) {
            const rt = this.responseTimes.get(node.nodeName);
            const average = rt ? rt.average : 0; // If no data, assume 0 (fastest)
            if (average < bestAverage) {
                bestAverage = average;
                bestNode = node;
            }
        }
        return bestNode || nodes[0];
    }

    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the Earth in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    getServices() {
        return Array.from(this.services.keys());
    }

    getLatestVersion(serviceName) {
        const versions = [];
        for (const [key] of this.services) {
            if (key.startsWith(serviceName + ':')) {
                const version = key.substring(serviceName.length + 1);
                versions.push(version);
            }
        }
        if (versions.length === 0) return null;
        // Sort versions, assuming semver like major.minor.patch
        versions.sort((a, b) => {
            const aParts = a.split('.').map(Number);
            const bParts = b.split('.').map(Number);
            for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                const aVal = aParts[i] || 0;
                const bVal = bParts[i] || 0;
                if (aVal !== bVal) return bVal - aVal; // descending
            }
            return 0;
        });
        return versions[0];
    }

    getVersions(serviceName) {
        const versions = [];
        for (const [key] of this.services) {
            if (key.startsWith(serviceName + ':')) {
                const version = key.substring(serviceName.length + 1);
                versions.push(version);
            }
        }
        // Also check if there's a versionless service
        if (this.services.has(serviceName)) {
            versions.push('default');
        }
        return versions.sort();
    }

    getAllServices() {
        const result = new Map();
        for (const [serviceName, service] of this.services) {
            result.set(serviceName, Array.from(service.nodes.values()));
        }
        return result;
    }

    // Basic tracing methods
    startTrace(id, operation) {
        this.traces.set(id, { operation, events: [], start: Date.now() });
    }

    addTraceEvent(id, event) {
        const trace = this.traces.get(id);
        if (trace) {
            trace.events.push({ event, timestamp: Date.now() });
        }
    }

    endTrace(id) {
        const trace = this.traces.get(id);
        if (trace) {
            trace.end = Date.now();
            trace.duration = trace.end - trace.start;
        }
    }

    getTrace(id) {
        return this.traces.get(id) || {};
    }

    // Circuit Breaker methods
    isCircuitOpen(nodeName) {
        const state = this.circuitState.get(nodeName);
        if (state === 'open') {
            const nextTry = this.circuitNextTry.get(nodeName);
            if (nextTry && Date.now() > nextTry) {
                // Time to try half-open
                this.circuitState.set(nodeName, 'half-open');
                this.circuitNextTry.delete(nodeName);
                if (global.broadcast) global.broadcast('circuit_half_open', { nodeId: nodeName });
                return false;
            }
            return true;
        }
        return false;
    }

    recordFailure(nodeName) {
        const currentFailures = this.circuitFailures.get(nodeName) || 0;
        this.circuitFailures.set(nodeName, currentFailures + 1);
        this.circuitLastFailure.set(nodeName, Date.now());

        if (currentFailures + 1 >= this.circuitBreakerThreshold) {
            this.circuitState.set(nodeName, 'open');
            // Exponential backoff for retry
            const delay = Math.min(this.circuitBreakerRetryDelay * Math.pow(2, currentFailures), this.circuitBreakerMaxRetryDelay);
            this.circuitNextTry.set(nodeName, Date.now() + delay);
            if (global.broadcast) global.broadcast('circuit_open', { nodeId: nodeName, failures: currentFailures + 1 });
        }
    }

    recordSuccess(nodeName) {
        this.circuitFailures.set(nodeName, 0);
        this.circuitState.set(nodeName, 'closed');
        this.circuitLastFailure.delete(nodeName);
        this.circuitNextTry.delete(nodeName);
        if (global.broadcast) global.broadcast('circuit_closed', { nodeId: nodeName });
    }

    getCircuitState(nodeName) {
        return {
            state: this.circuitState.get(nodeName) || 'closed',
            failures: this.circuitFailures.get(nodeName) || 0,
            lastFailure: this.circuitLastFailure.get(nodeName) || 0,
            nextTry: this.circuitNextTry.get(nodeName) || 0
        };
    }

    getRegistryData() {
        const data = {
            services: {},
            lastHeartbeats: {},
            nodeToService: {},
            servicesCount: this.servicesCount,
            nodesCount: this.nodesCount,
            circuitFailures: {},
            circuitState: {},
            circuitLastFailure: {},
             circuitNextTry: {},
              configurations: {},
              trafficDistribution: {},
              responseTimes: {}
        };
        for (const [serviceName, service] of this.services) {
            data.services[serviceName] = {
                nodes: {},
                healthyNodesArray: service.healthyNodesArray,
                roundRobinIndex: service.roundRobinIndex
            };
            for (const [nodeName, node] of service.nodes) {
                data.services[serviceName].nodes[nodeName] = node;
            }
        }
        for (const [node, ts] of this.lastHeartbeats) {
            data.lastHeartbeats[node] = ts;
        }
        for (const [node, service] of this.nodeToService) {
            data.nodeToService[node] = service;
        }
        for (const [node, failures] of this.circuitFailures) {
            data.circuitFailures[node] = failures;
        }
        for (const [node, state] of this.circuitState) {
            data.circuitState[node] = state;
        }
        for (const [node, ts] of this.circuitLastFailure) {
            data.circuitLastFailure[node] = ts;
        }
        for (const [node, ts] of this.circuitNextTry) {
            data.circuitNextTry[node] = ts;
        }
        for (const [serviceName, serviceConfigs] of this.configurations) {
            data.configurations[serviceName] = {};
            for (const [key, config] of serviceConfigs) {
                data.configurations[serviceName][key] = config;
            }
        }
         for (const [serviceName, distribution] of this.trafficDistribution) {
             data.trafficDistribution[serviceName] = distribution;
         }
        data.dependencies = {};
        for (const [service, deps] of this.dependencies) {
            data.dependencies[service] = Array.from(deps);
        }
        data.cacheHits = this.cacheHits;
        data.cacheMisses = this.cacheMisses;
          data.dependents = {};
          for (const [service, deps] of this.dependents) {
              data.dependents[service] = Array.from(deps);
          }
          data.responseTimes = {};
          for (const [node, rt] of this.responseTimes) {
              data.responseTimes[node] = rt;
          }
         data.acls = {};
         for (const [service, acl] of this.acls) {
             data.acls[service] = { allow: Array.from(acl.allow), deny: Array.from(acl.deny) };
         }
          data.intentions = {};
          for (const [key, action] of this.intentions) {
              data.intentions[key] = action;
          }
          data.blacklistedServices = Array.from(this.blacklistedServices);
          return data;
    }

    setRegistryData(data) {
        this.services = new Map();
        for (const [serviceName, serviceData] of Object.entries(data.services || {})) {
            const service = {
                nodes: new Map(),
                healthyNodesArray: serviceData.healthyNodesArray || [],
                roundRobinIndex: serviceData.roundRobinIndex || 0
            };
            for (const [nodeName, node] of Object.entries(serviceData.nodes || {})) {
                service.nodes.set(nodeName, node);
            }
            this.services.set(serviceName, service);
        }
        this.lastHeartbeats = new Map(Object.entries(data.lastHeartbeats || {}));
        this.nodeToService = new Map(Object.entries(data.nodeToService || {}));
        this.servicesCount = data.servicesCount || 0;
        this.nodesCount = data.nodesCount || 0;
        this.circuitFailures = new Map(Object.entries(data.circuitFailures || {}));
        this.circuitState = new Map(Object.entries(data.circuitState || {}));
        this.circuitLastFailure = new Map(Object.entries(data.circuitLastFailure || {}));
        this.circuitNextTry = new Map(Object.entries(data.circuitNextTry || {}));
        this.configurations = new Map();
        for (const [serviceName, configs] of Object.entries(data.configurations || {})) {
            const serviceConfigs = new Map();
            for (const [key, config] of Object.entries(configs)) {
                serviceConfigs.set(key, config);
            }
            this.configurations.set(serviceName, serviceConfigs);
        }
         this.trafficDistribution = new Map();
         for (const [serviceName, distribution] of Object.entries(data.trafficDistribution || {})) {
             this.trafficDistribution.set(serviceName, distribution);
         }
         this.dependencies = new Map();
         for (const [service, deps] of Object.entries(data.dependencies || {})) {
             this.dependencies.set(service, new Set(deps));
         }
         this.dependents = new Map();
         for (const [service, deps] of Object.entries(data.dependents || {})) {
             this.dependents.set(service, new Set(deps));
         }
         this.acls = new Map();
         for (const [service, acl] of Object.entries(data.acls || {})) {
             this.acls.set(service, { allow: new Set(acl.allow || []), deny: new Set(acl.deny || []) });
         }
                  this.intentions = new Map();
                  for (const [key, action] of Object.entries(data.intentions || {})) {
                      this.intentions.set(key, action);
                  }
                   this.blacklistedServices = new Set(data.blacklistedServices || []);
                   this.cacheHits = data.cacheHits || 0;
                   this.cacheMisses = data.cacheMisses || 0;
                   this.responseTimes = new Map();
                   for (const [node, rt] of Object.entries(data.responseTimes || {})) {
                       this.responseTimes.set(node, rt);
                   }
                   this.responseTimes = new Map();
                   for (const [node, rt] of Object.entries(data.responseTimes || {})) {
                       this.responseTimes.set(node, rt);
                   }
            this.saveRegistry();
    }

    saveRegistry() {
        if (!this.persistenceEnabled || this.savePending) return;
        this.savePending = true;
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(async () => {
            await this._doSave();
        }, 100); // Debounce saves by 100ms
    }

    async _doSave() {
        try {
            const data = this.getRegistryData();
            const jsonData = JSON.stringify(data, null, 2);
            const buffer = Buffer.from(jsonData, 'utf8');

            if (this.persistenceType === 'file') {
                await fs.promises.writeFile(this.registryFile, jsonData);
            } else if (this.persistenceType === 'redis') {
                if (this.redisClient) {
                    await this.redisClient.set('maxine:registry', jsonData);
                }
            } else if (this.persistenceType === 'mmap') {
                // Memory-mapped file persistence - zero-copy approach
                await this.saveMemoryMapped(buffer);
            } else if (this.persistenceType === 'shm') {
                // Shared memory persistence - ultra-fast in-memory access
                this.saveSharedMemory(buffer);
            }
            // DB persistence to be implemented
        } catch (err) {
            console.error('Error saving registry:', err);
        } finally {
            this.savePending = false;
        }
    }

    async saveMemoryMapped(buffer) {
        try {
            const fs = require('fs').promises;
            // Ensure file is large enough
            const stats = await fs.stat(this.registryFile);
            if (stats.size < buffer.length) {
                // Extend file size
                const extendBuffer = Buffer.alloc(buffer.length - stats.size);
                await fs.appendFile(this.registryFile, extendBuffer);
            }
            // Write directly to file (simulating mmap)
            const fd = await fs.open(this.registryFile, 'r+');
            await fd.write(buffer, 0, buffer.length, 0);
            await fd.close();
        } catch (err) {
            console.error('Memory-mapped save error:', err);
            // Fallback to regular file save
            await fs.promises.writeFile(this.registryFile, buffer);
        }
    }

    initRedis() {
        if (this.redisClient) return;
        const redis = require('redis');
        this.redisClient = redis.createClient({
            host: config.redisHost,
            port: config.redisPort,
            password: config.redisPassword
        });
        this.redisClient.connect().catch(err => console.error('Redis connect error:', err));
    }

    initMemoryMapped() {
        try {
            const fs = require('fs');
            // Create or open the memory-mapped file
            if (!fs.existsSync(this.registryFile)) {
                // Create file with initial size
                const buffer = Buffer.alloc(this.mmapSize);
                fs.writeFileSync(this.registryFile, buffer);
            }
            // Memory map the file
            this.mmapBuffer = fs.openSync(this.registryFile, 'r+');
            // For simplicity, we'll use regular file I/O but with memory-mapped approach
            // In a full implementation, we'd use mmap system calls via native addon
        } catch (err) {
            console.error('Failed to initialize memory-mapped persistence:', err);
            // Fallback to file persistence
            this.persistenceType = 'file';
        }
    }

    initSharedMemory() {
        try {
            // Use SharedArrayBuffer for in-memory shared access
            // Backed by file for persistence across restarts
            this.shmSize = 1024 * 1024 * 10; // 10MB
            if (typeof SharedArrayBuffer !== 'undefined') {
                this.sharedBuffer = new SharedArrayBuffer(this.shmSize);
                this.sharedView = new Uint8Array(this.sharedBuffer);
            } else {
                // Fallback for older Node.js versions
                this.sharedBuffer = Buffer.alloc(this.shmSize);
                this.sharedView = this.sharedBuffer;
            }
            // Load from file if exists
            this.loadSharedMemory();
        } catch (err) {
            console.error('Failed to initialize shared memory persistence:', err);
            // Fallback to file persistence
            this.persistenceType = 'file';
        }
    }

    loadSharedMemory() {
        try {
            if (fs.existsSync(this.registryFile)) {
                const data = fs.readFileSync(this.registryFile);
                const jsonStr = data.toString('utf8').trim();
                if (jsonStr) {
                    // Store JSON string in shared buffer
                    const jsonBuffer = Buffer.from(jsonStr, 'utf8');
                    if (jsonBuffer.length < this.shmSize) {
                        jsonBuffer.copy(this.sharedView);
                        this.sharedView[jsonBuffer.length] = 0; // Null terminator
                    }
                }
            }
        } catch (err) {
            console.error('Error loading shared memory:', err);
        }
    }

    saveSharedMemory(buffer) {
        try {
            // Write to shared buffer
            if (buffer.length < this.shmSize) {
                buffer.copy(this.sharedView);
                this.sharedView[buffer.length] = 0; // Null terminator
            }
            // Also persist to file
            fs.writeFileSync(this.registryFile, buffer);
        } catch (err) {
            console.error('Shared memory save error:', err);
            // Fallback to regular file save
            fs.writeFileSync(this.registryFile, buffer);
        }
    }

    loadRegistry() {
        try {
            if (this.persistenceType === 'file' || this.persistenceType === 'mmap') {
                if (fs.existsSync(this.registryFile)) {
                    const data = fs.readFileSync(this.registryFile, 'utf8');
                    if (data.trim()) {
                        const parsed = JSON.parse(data);
                        this.setRegistryData(parsed);
                    }
                }
            } else if (this.persistenceType === 'shm') {
                // Load from shared memory
                let endIndex = 0;
                while (endIndex < this.shmSize && this.sharedView[endIndex] !== 0) {
                    endIndex++;
                }
                if (endIndex > 0) {
                    const jsonStr = Buffer.from(this.sharedView.slice(0, endIndex)).toString('utf8');
                    if (jsonStr.trim()) {
                        const parsed = JSON.parse(jsonStr);
                        this.setRegistryData(parsed);
                    }
                }
            } else if (this.persistenceType === 'redis') {
                // Redis loading is async, handled separately
            }
        } catch (err) {
            console.error('Error loading registry:', err);
        }
    }

    // Configuration management methods
    setConfig(serviceName, key, value, metadata = {}) {
        if (!this.configurations.has(serviceName)) {
            this.configurations.set(serviceName, new Map());
        }
        const serviceConfigs = this.configurations.get(serviceName);
        const current = serviceConfigs.get(key);
        const version = current ? current.version + 1 : 1;
        const config = { value, version, metadata, updatedAt: Date.now() };
        serviceConfigs.set(key, config);
        this.saveRegistry();
        if (global.broadcast) global.broadcast('config_changed', { serviceName, key, value, version, metadata });
        return config;
    }

    getConfig(serviceName, key) {
        const serviceConfigs = this.configurations.get(serviceName);
        if (!serviceConfigs) return null;
        return serviceConfigs.get(key) || null;
    }

    getAllConfigs(serviceName) {
        const serviceConfigs = this.configurations.get(serviceName);
        if (!serviceConfigs) return {};
        const result = {};
        for (const [key, config] of serviceConfigs) {
            result[key] = config;
        }
        return result;
    }

    deleteConfig(serviceName, key) {
        const serviceConfigs = this.configurations.get(serviceName);
        if (!serviceConfigs) return false;
        const deleted = serviceConfigs.delete(key);
        if (deleted) {
            this.saveRegistry();
            if (global.broadcast) global.broadcast('config_deleted', { serviceName, key });
        }
        return deleted;
    }

    loadRegistry() {
        if (!this.persistenceEnabled) return;
        try {
            let data;
            if (this.persistenceType === 'file') {
                if (fs.existsSync(this.registryFile)) {
                    data = JSON.parse(fs.readFileSync(this.registryFile, 'utf8'));
                }
            } else if (this.persistenceType === 'redis') {
                // For Redis, load is async, so skip for now in constructor
                // Will load on first save or manually
            }
            // DB load to be implemented
            if (data) {
                this.services = new Map();
                for (const [serviceName, serviceData] of Object.entries(data.services || {})) {
                    const service = {
                        nodes: new Map(),
                        healthyNodesArray: serviceData.healthyNodesArray || [],
                        roundRobinIndex: serviceData.roundRobinIndex || 0
                    };
                    for (const [nodeName, node] of Object.entries(serviceData.nodes || {})) {
                        service.nodes.set(nodeName, node);
                    }
                    this.services.set(serviceName, service);
                }
                this.lastHeartbeats = new Map(Object.entries(data.lastHeartbeats || {}));
                this.nodeToService = new Map(Object.entries(data.nodeToService || {}));
                this.servicesCount = data.servicesCount || 0;
                this.nodesCount = data.nodesCount || 0;
                this.circuitFailures = new Map(Object.entries(data.circuitFailures || {}));
                this.circuitState = new Map(Object.entries(data.circuitState || {}));
                this.circuitLastFailure = new Map(Object.entries(data.circuitLastFailure || {}));
                this.circuitNextTry = new Map(Object.entries(data.circuitNextTry || {}));
                // Load configurations
                this.configurations = new Map();
                for (const [serviceName, configs] of Object.entries(data.configurations || {})) {
                    const serviceConfigs = new Map();
                    for (const [key, config] of Object.entries(configs)) {
                        serviceConfigs.set(key, config);
                    }
                    this.configurations.set(serviceName, serviceConfigs);
                }
                 // Load traffic distribution
                 this.trafficDistribution = new Map();
                 for (const [serviceName, distribution] of Object.entries(data.trafficDistribution || {})) {
                     this.trafficDistribution.set(serviceName, distribution);
                 }
                 // Load dependencies
                 this.dependencies = new Map();
                 for (const [service, deps] of Object.entries(data.dependencies || {})) {
                     this.dependencies.set(service, new Set(deps));
                 }
                 this.dependents = new Map();
                 for (const [service, deps] of Object.entries(data.dependents || {})) {
                     this.dependents.set(service, new Set(deps));
                 }
                 this.acls = new Map();
                 for (const [service, acl] of Object.entries(data.acls || {})) {
                     this.acls.set(service, { allow: new Set(acl.allow || []), deny: new Set(acl.deny || []) });
                 }
                  this.intentions = new Map();
                  for (const [key, action] of Object.entries(data.intentions || {})) {
                      this.intentions.set(key, action);
                  }
                  this.cacheHits = data.cacheHits || 0;
                  this.cacheMisses = data.cacheMisses || 0;
             }
        } catch (err) {
            console.error('Error loading registry:', err);
        }
    }

    // Traffic distribution for canary deployments
    // serviceName -> { version: percentage }
    trafficDistribution = new Map();

    setTrafficDistribution(serviceName, distribution) {
        // distribution: { 'v1.0': 80, 'v2.0': 20 }
        this.trafficDistribution.set(serviceName, distribution);
        this.saveRegistry();
    }

    getTrafficDistribution(serviceName) {
        return this.trafficDistribution.get(serviceName) || {};
    }

    // Enhanced discover with canary support and federation
    async discover(serviceName, options = {}) {
        const { version, loadBalancing = 'round-robin', tags = [], ip, proxy } = options;
        let fullServiceName = serviceName;
        if (version) {
            if (version === 'latest') {
                const latest = this.getLatestVersion(serviceName);
                if (latest) {
                    fullServiceName = `${serviceName}:${latest}`;
                }
            } else {
                fullServiceName = `${serviceName}:${version}`;
            }
        } else {
            // Check for traffic distribution (canary)
            const distribution = this.getTrafficDistribution(serviceName);
            if (Object.keys(distribution).length > 0) {
                const rand = fastRandom() * 100;
                let cumulative = 0;
                for (const [ver, percent] of Object.entries(distribution)) {
                    cumulative += percent;
                    if (rand <= cumulative) {
                        fullServiceName = `${serviceName}:${ver}`;
                        break;
                    }
                }
            }
        }
        let node = this.getRandomNode(fullServiceName, loadBalancing, ip, tags);
        if (node) return node;

        // If not found locally and federation enabled, try peers
        if (config.federationEnabled && config.federationPeers.length > 0) {
            for (const peer of config.federationPeers) {
                try {
                    const url = `${peer}/discover?serviceName=${encodeURIComponent(fullServiceName)}&loadBalancing=${loadBalancing}&tags=${tags.join(',')}${version ? `&version=${version}` : ''}`;
                    const response = await axios.get(url, { timeout: config.federationTimeout });
                    if (response.data && response.data.address) {
                        // Cache locally? For simplicity, just return
                        return { address: response.data.address, nodeName: response.data.nodeName, healthy: true };
                    }
                } catch (err) {
                    // Ignore errors, try next peer
                }
            }
        }
        return null;
    }

    // Version management
    promoteVersion(serviceName, version) {
        // For blue-green, this could set the 'active' version
        // For now, just update traffic to 100% for this version
        this.setTrafficDistribution(serviceName, { [version]: 100 });
    }

    retireVersion(serviceName, version) {
        const distribution = this.getTrafficDistribution(serviceName);
        delete distribution[version];
        this.setTrafficDistribution(serviceName, distribution);
        // Optionally deregister all nodes of this version
        const fullName = `${serviceName}:${version}`;
        const service = this.services.get(fullName);
        if (service) {
            for (const nodeId of service.nodes.keys()) {
                this.deregister(nodeId);
            }
        }
    }

        // Shift traffic gradually
        shiftTraffic(serviceName, fromVersion, toVersion, percentage) {
            const distribution = this.getTrafficDistribution(serviceName);
            const fromPercent = distribution[fromVersion] || 0;
            const toPercent = distribution[toVersion] || 0;
            const shiftAmount = Math.min(fromPercent, percentage);
            distribution[fromVersion] = fromPercent - shiftAmount;
            distribution[toVersion] = toPercent + shiftAmount;
            if (distribution[fromVersion] <= 0) delete distribution[fromVersion];
            this.setTrafficDistribution(serviceName, distribution);
        }

        // Federation replication
        async replicateRegistration(serviceName, node) {
            if (!config.federationEnabled || config.federationPeers.length === 0) return;
            for (const peer of config.federationPeers) {
                try {
                    await axios.post(`${peer}/register`, {
                        serviceName,
                        host: node.host,
                        port: node.port,
                        metadata: node.metadata
                    }, { timeout: config.federationTimeout });
                } catch (err) {
                    // Ignore replication errors
                }
            }
        }

        async replicateDeregistration(nodeId) {
            if (!config.federationEnabled || config.federationPeers.length === 0) return;
            for (const peer of config.federationPeers) {
                try {
                    await axios.delete(`${peer}/deregister`, {
                        data: { nodeId },
                        timeout: config.federationTimeout
                    });
                } catch (err) {
                    // Ignore replication errors
                }
            }
        }

        // Service dependency management
        addDependency(serviceName, dependsOn) {
            if (!this.dependencies.has(serviceName)) {
                this.dependencies.set(serviceName, new Set());
            }
            this.dependencies.get(serviceName).add(dependsOn);

            if (!this.dependents.has(dependsOn)) {
                this.dependents.set(dependsOn, new Set());
            }
            this.dependents.get(dependsOn).add(serviceName);

            this.saveRegistry();
        }

        removeDependency(serviceName, dependsOn) {
            if (this.dependencies.has(serviceName)) {
                this.dependencies.get(serviceName).delete(dependsOn);
            }
            if (this.dependents.has(dependsOn)) {
                this.dependents.get(dependsOn).delete(serviceName);
            }
            this.saveRegistry();
        }

        getDependencies(serviceName) {
            return Array.from(this.dependencies.get(serviceName) || []);
        }

        getDependents(serviceName) {
            return Array.from(this.dependents.get(serviceName) || []);
        }

        getDependencyGraph() {
            const graph = {};
            for (const [service, deps] of this.dependencies) {
                graph[service] = Array.from(deps);
            }
            return graph;
        }

        detectCycles() {
            const visited = new Set();
            const recStack = new Set();
            const cycles = [];

            const dfs = (node, path) => {
                if (recStack.has(node)) {
                    const cycleStart = path.indexOf(node);
                    cycles.push(path.slice(cycleStart).concat(node));
                    return;
                }
                if (visited.has(node)) return;
                visited.add(node);
                recStack.add(node);
                const deps = this.dependencies.get(node) || [];
                for (const dep of deps) {
                    dfs(dep, [...path, node]);
                }
                recStack.delete(node);
            };

            for (const service of this.services.keys()) {
                if (!visited.has(service)) {
                    dfs(service, []);
                }
            }
            return cycles;
        }

        // ACL methods
        setACL(serviceName, allow, deny) {
            this.acls.set(serviceName, { allow: new Set(allow || []), deny: new Set(deny || []) });
            this.saveRegistry();
        }

        getACL(serviceName) {
            const acl = this.acls.get(serviceName);
            if (!acl) return { allow: [], deny: [] };
            return { allow: Array.from(acl.allow), deny: Array.from(acl.deny) };
        }

        checkPermission(requester, target) {
            const acl = this.acls.get(target);
            if (!acl) return true; // no restrictions
            if (acl.deny.has(requester)) return false;
            if (acl.allow.size > 0 && !acl.allow.has(requester)) return false;
            return true;
        }

        // Intention methods
        setIntention(source, destination, action) {
            this.intentions.set(`${source}:${destination}`, action);
            this.saveRegistry();
        }

        getIntention(source, destination) {
            return this.intentions.get(`${source}:${destination}`) || 'allow';
        }

        // Blacklist methods
        addToBlacklist(serviceName) {
            this.blacklistedServices.add(serviceName);
            this.saveRegistry();
        }

        removeFromBlacklist(serviceName) {
            this.blacklistedServices.delete(serviceName);
            this.saveRegistry();
        }

        isBlacklisted(serviceName) {
            return this.blacklistedServices.has(serviceName);
        }

        getBlacklist() {
            return Array.from(this.blacklistedServices);
        }

        // Response time recording for predictive load balancing
        recordResponseTime(nodeId, responseTime) {
            if (!this.responseTimes.has(nodeId)) {
                this.responseTimes.set(nodeId, { count: 0, sum: 0, average: 0 });
            }
            const rt = this.responseTimes.get(nodeId);
            rt.count++;
            rt.sum += responseTime;
            rt.average = rt.sum / rt.count;

            // Store historical data for predictive analytics
            if (!this.responseTimeHistory.has(nodeId)) {
                this.responseTimeHistory.set(nodeId, []);
            }
            const history = this.responseTimeHistory.get(nodeId);
            history.push({ timestamp: Date.now(), responseTime });

            // Keep only last 100 entries to prevent memory bloat
            if (history.length > 100) {
                history.shift();
            }

            // Update health score after recording response time
            this.updateHealthScore(nodeId);
        }

        // Get response time history for predictive load balancing
        getResponseTimeHistory(nodeId) {
            const history = this.responseTimeHistory.get(nodeId);
            if (!history) return null;

            // Return response times from last time window
            const cutoff = Date.now() - this.timeWindow;
            return history.filter(entry => entry.timestamp > cutoff)
                         .map(entry => entry.responseTime);
        }

        // Health score calculation (0-100, higher better)
        calculateHealthScore(nodeId) {
            const rt = this.responseTimes.get(nodeId);
            const failures = this.circuitFailures.get(nodeId) || 0;
            const circuitOpen = this.isCircuitOpen(nodeId);
            let score = 100;
            if (rt && rt.count > 0) {
                // Penalize for slow average response time (up to 20 points for >2s average)
                score -= Math.min(rt.average / 100, 20);
            }
            // Penalize for circuit breaker failures (5 points per failure, up to 30)
            score -= Math.min(failures * 5, 30);
            // Heavy penalty for open circuit
            if (circuitOpen) score -= 50;
            return Math.max(0, Math.min(100, score));
        }

        // Update health score for a node
        updateHealthScore(nodeId) {
            this.healthScores.set(nodeId, this.calculateHealthScore(nodeId));
        }

        // Update health scores for all nodes (called periodically)
        updateAllHealthScores() {
            for (const [serviceName, service] of this.services) {
                for (const node of service.healthyNodesArray) {
                    this.updateHealthScore(node.nodeName);
                }
            }
        }

        // Select node with highest health score
        selectHealthScore(nodes) {
            let bestNode = null;
            let bestScore = -1;
            for (const node of nodes) {
                const score = this.healthScores.get(node.nodeName) || 0;
                if (score > bestScore) {
                    bestScore = score;
                    bestNode = node;
                }
            }
            return bestNode || nodes[0];
        }

        // Get health scores for a service
        getHealthScores(serviceName) {
            const service = this.services.get(serviceName);
            if (!service) return {};
            const scores = {};
            for (const node of service.healthyNodesArray) {
                scores[node.nodeName] = this.healthScores.get(node.nodeName) || 0;
            }
            return scores;
        }

        // Anomaly detection
        getAnomalies() {
            const anomalies = [];
            for (const [serviceName, service] of this.services) {
                const failureCount = Array.from(this.circuitFailures.values()).reduce((sum, count) => sum + count, 0);
                if (failureCount > 10) { // threshold
                    anomalies.push({ serviceName, type: 'high_circuit_failures', value: failureCount });
                }
                if (service.healthyNodesArray.length === 0 && service.nodes.size > 0) {
                    anomalies.push({ serviceName, type: 'no_healthy_nodes' });
                }
                if (service.nodes.size === 0) {
                    anomalies.push({ serviceName, type: 'no_nodes' });
                }
            }
            return anomalies;
        }
}

module.exports = { LightningServiceRegistrySimple };