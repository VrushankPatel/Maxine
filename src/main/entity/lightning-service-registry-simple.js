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

        // Tag index for fast filtering
        this.tagIndex = new Map(); // tag -> Set<nodeName>

        // Cached counts for performance
        this.servicesCount = 0;
        this.nodesCount = 0;

        // Ultra-fast lookup
        this.ultraFastHealthyNodes = new Map(); // serviceName -> { array: [], available: [] }

        // Configuration management
        this.configurations = new Map(); // serviceName -> Map<key, {value, version, metadata, updatedAt}>

        // Traffic distribution for canary deployments
        this.trafficDistribution = new Map(); // serviceName -> { version: percentage }

        // Service dependencies
        this.dependencies = new Map(); // serviceName -> Set of services it depends on
        this.dependents = new Map(); // serviceName -> Set of services that depend on it
        this.callLogs = new Map(); // serviceName -> Map<calledService, {count, lastSeen}>

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

        // Adaptive LRU Cache for discovery results (10k entries, adaptive TTL)
        this.discoveryCache = new Map(); // key -> { value, timestamp, accessCount, lastAccess }
        this.cacheMaxSize = 10000;

        // Distributed Redis Cache for multi-instance caching
        this.redisCacheEnabled = config.redisCacheEnabled || false;

        // AI-Driven Load Balancing (Reinforcement Learning)
        this.qTable = new Map(); // state -> array of q-values
        this.alpha = 0.1; // Learning rate
        this.gamma = 0.9; // Discount factor
        this.epsilon = 0.1; // Exploration rate
        this.aiSelections = new Map(); // clientId -> {state, action, nodeId, timestamp}
        this.redisCachePrefix = 'maxine:cache:';

        // Cache metrics
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.redisCacheHits = 0;
        this.redisCacheMisses = 0;

        // Advanced AI-Driven Load Balancing (Reinforcement Learning + Predictive Analytics)
        this.qTable = new Map(); // serviceName -> Map<nodeName, qValue>
        this.alpha = 0.1; // Learning rate
        this.gamma = 0.9; // Discount factor
        this.epsilon = 0.1; // Exploration rate
        this.rewardHistory = new Map(); // nodeName -> recent rewards

        // Advanced ML features
        this.nodePerformanceModel = new Map(); // nodeName -> { responseTimeModel, errorRateModel, loadModel }
        this.timeSeriesData = new Map(); // nodeName -> [{timestamp, responseTime, success, load}, ...]
        this.predictionWindow = 300000; // 5 minutes for predictions
        this.modelUpdateInterval = 60000; // Update models every minute

        // Rate limiting
        this.rateLimits = new Map(); // For in-memory fallback
        this.rateLimitEnabled = config.rateLimitEnabled && !config.ultraFastMode;

        this.checkRateLimit = (key, maxRequests = 1000, windowMs = 15 * 60 * 1000) => {
            if (!this.rateLimitEnabled) {
                return true; // Rate limiting disabled
            }
            const now = Date.now();
            const windowKey = `${key}:${Math.floor(now / windowMs)}`;

            // In-memory rate limiting (for distributed, would need Redis with sync interface, but for now use this)
            if (!this.rateLimits.has(windowKey)) {
                this.rateLimits.set(windowKey, { count: 1, expires: now + windowMs });
                return true;
            }

            const limit = this.rateLimits.get(windowKey);
            if (now > limit.expires) {
                limit.count = 1;
                limit.expires = now + windowMs;
                return true;
            }

            if (limit.count >= maxRequests) {
                return false;
            }

            limit.count++;
            return true;
        };

        // Adaptive caching methods
        this.getCache = async (key) => {
            // First check local cache
            const entry = this.discoveryCache.get(key);
            if (entry) {
                const now = Date.now();
                const ttl = this.getAdaptiveTTL(entry.accessCount, now - entry.lastAccess);
                if (now - entry.timestamp <= ttl) {
                    entry.accessCount++;
                    entry.lastAccess = now;
                    this.cacheHits++;
                    return entry.value;
                } else {
                    this.discoveryCache.delete(key);
                }
            }

            // Check Redis distributed cache if enabled
            if (this.redisCacheEnabled && this.redisClient) {
                try {
                    const redisKey = this.redisCachePrefix + key;
                    const cached = await this.redisClient.get(redisKey);
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        const now = Date.now();
                        if (now - parsed.timestamp <= parsed.ttl) {
                            // Store in local cache
                            this.discoveryCache.set(key, {
                                value: parsed.value,
                                timestamp: parsed.timestamp,
                                accessCount: 1,
                                lastAccess: now
                            });
                            this.redisCacheHits++;
                            return parsed.value;
                        } else {
                            // Expired, delete from Redis
                            await this.redisClient.del(redisKey);
                        }
                    }
                } catch (err) {
                    // Ignore Redis errors
                }
            }

            this.cacheMisses++;
            if (this.redisCacheEnabled) this.redisCacheMisses++;
            return null;
        };

        this.setCache = async (key, value) => {
            const now = Date.now();
            const ttl = 30000; // 30 seconds for distributed cache

            // Set in local cache
            if (this.discoveryCache.size >= this.cacheMaxSize) {
                // Evict least recently used (simple: first key)
                const firstKey = this.discoveryCache.keys().next().value;
                this.discoveryCache.delete(firstKey);
            }
            this.discoveryCache.set(key, { value, timestamp: now, accessCount: 1, lastAccess: now });

            // Set in Redis distributed cache if enabled
            if (this.redisCacheEnabled && this.redisClient) {
                try {
                    const redisKey = this.redisCachePrefix + key;
                    const cacheData = JSON.stringify({ value, timestamp: now, ttl });
                    await this.redisClient.setEx(redisKey, Math.ceil(ttl / 1000), cacheData);
                } catch (err) {
                    // Ignore Redis errors
                }
            }
        };

        this.getAdaptiveTTL = (accessCount, timeSinceLastAccess) => {
            // If accessed recently and frequently, longer TTL
            if (timeSinceLastAccess < 60000 && accessCount > 5) {
                return 60000; // 1 minute for hot keys
            } else if (accessCount > 2) {
                return 30000; // 30 seconds for warm keys
            } else {
                return 10000; // 10 seconds for cold keys
            }
        };

        // Response time tracking for predictive load balancing
        this.responseTimes = new Map(); // nodeName -> { count, sum, average }
        this.responseTimeHistory = new Map(); // nodeName -> [{timestamp, responseTime}, ...] (last 100 entries)
        this.timeWindow = 300000; // 5 minutes for historical data

        // Object pooling for response time history entries to reduce GC pressure
        this.responseTimeEntryPool = [];
        this.poolMaxSize = 10000;

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

                    // Update ultra-fast lookup
                    const ultraFast = this.ultraFastHealthyNodes.get(serviceName);
                    if (ultraFast) {
                        const idx = ultraFast.array.findIndex(n => n.nodeName === nodeName);
                        if (idx !== -1) {
                            ultraFast.array.splice(idx, 1);
                            if (ultraFast.available) {
                                const availIdx = ultraFast.available.findIndex(n => n.nodeName === nodeName);
                                if (availIdx !== -1) ultraFast.available.splice(availIdx, 1);
                            }
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

        // Update Prometheus metrics
        if (global.promMetrics) {
            let openCount = 0;
            for (const state of this.circuitState.values()) {
                if (state === 'open') openCount++;
            }
            global.promMetrics.circuitBreakersOpen.set(openCount);
            global.promMetrics.activeServices.set(this.servicesCount);
            global.promMetrics.activeNodes.set(this.nodesCount);
        }

        if (toRemove.length > 0) {
            this.saveRegistry();
        }
    }

    register(serviceName, nodeInfo) {
        const startTime = Date.now();
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
                    return nodeName;
                }
        service.nodes.set(nodeName, node);
        service.healthyNodesArray.push(node);
        this.nodeToService.set(nodeName, fullServiceName);
        this.lastHeartbeats.set(nodeName, Date.now());
        this.nodesCount++;

        // Update ultra-fast lookup
        if (!this.ultraFastHealthyNodes.has(fullServiceName)) {
            this.ultraFastHealthyNodes.set(fullServiceName, { array: [], available: [] });
        }
        this.ultraFastHealthyNodes.get(fullServiceName).array.push(node);

        // Update tag index
        if (node.metadata && node.metadata.tags) {
            for (const tag of node.metadata.tags) {
                if (!this.tagIndex.has(tag)) {
                    this.tagIndex.set(tag, new Set());
                }
                this.tagIndex.get(tag).add(nodeName);
            }
        }

                this.saveRegistry();
                this.invalidateDiscoveryCache(fullServiceName);
                if (global.broadcast) global.broadcast('service_registered', { serviceName: fullServiceName, nodeId: nodeName });
                // Replicate to federation peers
                // this.replicateRegistration(fullServiceName, node);

                // Update Prometheus metrics
                // if (global.promMetrics) {
                //     global.promMetrics.serviceRegistrations.inc();
                //     global.promMetrics.activeServices.set(this.servicesCount);
                //     global.promMetrics.activeNodes.set(this.nodesCount);
                //     global.promMetrics.responseTimeHistogram.observe('register', (Date.now() - startTime) / 1000);
                // }

                return nodeName;
            } catch (error) {
                throw error;
            }
    }

    deregister(nodeId) {
        const startTime = Date.now();
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

                // Update ultra-fast lookup
                const ultraFast = this.ultraFastHealthyNodes.get(serviceName);
                if (ultraFast) {
                    const idx = ultraFast.array.findIndex(n => n.nodeName === nodeId);
                    if (idx !== -1) {
                        ultraFast.array.splice(idx, 1);
                        if (ultraFast.available) {
                            const availIdx = ultraFast.available.findIndex(n => n.nodeName === nodeId);
                            if (availIdx !== -1) ultraFast.available.splice(availIdx, 1);
                        }
                    }
                }
                this.nodesCount--;
            }
            if (service.nodes.size === 0) {
                this.services.delete(serviceName);
                this.servicesCount--;
            }
        }
        // Update tag index
        if (service && service.nodes.has(nodeId)) {
            const node = service.nodes.get(nodeId);
            if (node.metadata && node.metadata.tags) {
                for (const tag of node.metadata.tags) {
                    if (this.tagIndex.has(tag)) {
                        this.tagIndex.get(tag).delete(nodeId);
                        if (this.tagIndex.get(tag).size === 0) {
                            this.tagIndex.delete(tag);
                        }
                    }
                }
            }
        }

        this.lastHeartbeats.delete(nodeId);
        this.nodeToService.delete(nodeId);
        this.saveRegistry();
        this.invalidateDiscoveryCache(serviceName);
        if (global.broadcast) global.broadcast('service_deregistered', { nodeId });
        // Replicate to federation peers
        this.replicateDeregistration(nodeId);

        // Update Prometheus metrics
        if (global.promMetrics) {
            global.promMetrics.serviceDeregistrations.inc();
            global.promMetrics.activeServices.set(this.servicesCount);
            global.promMetrics.activeNodes.set(this.nodesCount);
            global.promMetrics.responseTimeHistogram.observe('deregister', (Date.now() - startTime) / 1000);
        }
    }

    heartbeat(nodeId) {
        const startTime = Date.now();
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

            // Update Prometheus metrics
            if (global.promMetrics) {
                global.promMetrics.serviceHeartbeats.inc();
                global.promMetrics.responseTimeHistogram.observe('heartbeat', (Date.now() - startTime) / 1000);
            }

            return true;
        }
        return false;
    }

    async getRandomNode(serviceName, strategy = 'round-robin', clientIP = null, tags = null, version = null) {
        const tracer = trace.getTracer('maxine-registry-simple', '1.0.0');
        const startTime = Date.now();
        return await tracer.startActiveSpan('getRandomNode', async (span) => {
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
        const cacheableStrategies = ['consistent-hash', 'ip-hash', 'geo-aware', 'least-response-time', 'health-score', 'predictive'];
        if (cacheableStrategies.includes(strategy)) {
            const cacheKey = `${fullServiceName}:${strategy}:${clientIP || 'default'}:${tags ? tags.sort().join(',') : ''}`;
            const cached = await this.getCache(cacheKey);
            if (cached) {
                // Cache hit
                if (global.promMetrics) {
                    global.promMetrics.cacheHits.inc();
                }
                return cached;
            } else {
                // Cache miss
                if (global.promMetrics) {
                    global.promMetrics.cacheMisses.inc();
                }
            }
        }

        const service = this.services.get(fullServiceName);
        if (!service || service.healthyNodesArray.length === 0) return null;

        // Filter out nodes with open circuit breakers
        let availableNodes = service.healthyNodesArray.filter(node => !this.isCircuitOpen(node.nodeName));

        // Filter by tags if provided (optimized with tag index)
        if (tags && tags.length > 0) {
            let intersection = null;
            for (const tag of tags) {
                const nodesForTag = this.tagIndex.get(tag);
                if (!nodesForTag) {
                    intersection = new Set();
                    break;
                }
                if (intersection === null) {
                    intersection = new Set(nodesForTag);
                } else {
                    // Intersect
                    for (const node of Array.from(intersection)) {
                        if (!nodesForTag.has(node)) {
                            intersection.delete(node);
                        }
                    }
                }
            }
            if (intersection) {
                availableNodes = availableNodes.filter(node => intersection.has(node.nodeName));
            } else {
                availableNodes = [];
            }
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
                case 'predictive':
                    selectedNode = this.selectPredictive(availableNodes);
                    break;
                 case 'ai-driven':
                     selectedNode = this.selectAIDriven(availableNodes, clientIP);
                     break;
                  case 'cost-aware':
                      selectedNode = this.selectCostAware(availableNodes);
                      break;
                  case 'power-of-two-choices':
                      selectedNode = this.selectPowerOfTwoChoices(availableNodes);
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
                    await this.setCache(cacheKey, selectedNode);
                }

                // Update Prometheus metrics
                if (global.promMetrics) {
                    global.promMetrics.serviceDiscoveries.inc({ service_name: fullServiceName, strategy });
                    global.promMetrics.responseTimeHistogram.observe('discover', (Date.now() - startTime) / 1000);
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
        // SIMD-like optimization: pre-compute cumulative weights for binary search
        const cumulative = [];
        let sum = 0;
        for (const node of nodes) {
            sum += node.weight;
            cumulative.push({ node, cumulative: sum });
        }
        const totalWeight = sum;
        const random = fastRandom() * totalWeight;

        // Binary search for faster selection (SIMD-inspired bulk processing)
        let low = 0, high = cumulative.length - 1;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (random > cumulative[mid].cumulative) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        return cumulative[low].node;
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

    ultraFastGetRandomNode(serviceName, strategy = 'round-robin', clientId = null, tags = []) {
        const service = this.services.get(serviceName);
        if (!service || service.healthyNodesArray.length === 0) return null;

        let nodes = service.healthyNodesArray;

        // Filter by tags if specified
        if (tags && tags.length > 0) {
            nodes = nodes.filter(node => {
                const nodeTags = node.metadata && node.metadata.tags;
                if (!nodeTags || !Array.isArray(nodeTags)) return false;
                return tags.every(tag => nodeTags.includes(tag));
            });
            if (nodes.length === 0) return null;
        }
        if (strategy === 'least-connections') {
            let minConnections = Infinity;
            let selectedNode = nodes[0];
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const connections = node.connections || 0;
                if (connections < minConnections) {
                    minConnections = connections;
                    selectedNode = node;
                    if (minConnections === 0) break;
                }
            }
            return selectedNode;
        } else if (strategy === 'weighted-random') {
            // Simple weighted random
            const totalWeight = nodes.reduce((sum, n) => sum + (n.weight || 1), 0);
            let rand = fastRandom() * totalWeight;
            for (const node of nodes) {
                rand -= node.weight || 1;
                if (rand <= 0) return node;
            }
            return nodes[0];
        } else if (strategy === 'random') {
            const randomIndex = (fastRandom() * nodes.length) | 0;
            return nodes[randomIndex];
        } else if (strategy === 'consistent-hash' && clientId) {
            const hash = this.simpleHash(clientId);
            const index = hash % nodes.length;
            return nodes[index];
        } else if (strategy === 'ai-driven' || strategy === 'advanced-ml') {
            // Advanced ML-based selection
            return this.selectAdvancedML(nodes, serviceName, clientId);
        } else if (strategy === 'power-of-two-choices') {
            // Power of two choices: select two random nodes, pick the one with fewer connections
            if (nodes.length < 2) return nodes[0];
            const choice1 = nodes[(fastRandom() * nodes.length) | 0];
            const choice2 = nodes[(fastRandom() * nodes.length) | 0];
            const conn1 = choice1.connections || 0;
            const conn2 = choice2.connections || 0;
            return conn1 <= conn2 ? choice1 : choice2;
        } else {
            // round-robin
            let index = service.roundRobinIndex || 0;
            const node = nodes[index];
            service.roundRobinIndex = (index + 1) % nodes.length;
            return node;
        }
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    selectAIDriven(nodes, clientId) {
        // Simple AI-driven: use Q-learning to select best node
        if (nodes.length === 0) return null;
        if (nodes.length === 1) return nodes[0];

        // Use clientId as state, or default
        const state = clientId || 'default';
        const qValues = this.qTable.get(state);
        if (!qValues) {
            // No data, explore randomly
            const randomIndex = (fastRandom() * nodes.length) | 0;
            return nodes[randomIndex];
        }

        // Select node with highest Q-value
        let bestNode = null;
        let bestQ = -Infinity;
        for (const node of nodes) {
            const q = qValues.get(node.nodeName) || 0;
            if (q > bestQ) {
                bestQ = q;
                bestNode = node;
            }
        }
        return bestNode || nodes[0];
    }

    updateQValue(nodeName, responseTime, success, serviceName, clientId) {
        const state = clientId || 'default';
        if (!this.qTable.has(state)) {
            this.qTable.set(state, new Map());
        }
        const qValues = this.qTable.get(state);
        const currentQ = qValues.get(nodeName) || 0;
        // Reward: lower response time is better, success is +1, failure -1
        const reward = success ? (1000 / (responseTime + 1)) : -1;
        const newQ = currentQ + this.alpha * (reward + this.gamma * 0 - currentQ); // Simplified, no next state
        qValues.set(nodeName, newQ);
    }

    // Advanced ML-based node selection using predictive analytics
    selectAdvancedML(nodes, serviceName, clientId) {
        if (nodes.length === 0) return null;
        if (nodes.length === 1) return nodes[0];

        const now = Date.now();

        // Calculate predicted performance for each node
        const predictions = nodes.map(node => {
            const prediction = this.predictNodePerformance(node.nodeName, now);
            return {
                node,
                predictedResponseTime: prediction.responseTime,
                predictedErrorRate: prediction.errorRate,
                predictedLoad: prediction.load,
                confidence: prediction.confidence
            };
        });

        // Score nodes based on multiple factors
        const scoredNodes = predictions.map(pred => {
            let score = 0;

            // Response time score (lower is better)
            score += (1000 - Math.min(pred.predictedResponseTime, 1000)) / 10;

            // Error rate score (lower is better)
            score += (1 - pred.predictedErrorRate) * 50;

            // Load score (lower load is better)
            score += (1 - pred.predictedLoad) * 30;

            // Confidence bonus
            score += pred.confidence * 20;

            // Q-learning bonus for this client
            const state = clientId || 'default';
            const qValues = this.qTable.get(state);
            if (qValues) {
                score += (qValues.get(pred.node.nodeName) || 0) * 10;
            }

            return { ...pred, score };
        });

        // Select node with highest score, with some exploration
        if (fastRandom() < this.epsilon) {
            // Exploration: random selection
            return nodes[Math.floor(fastRandom() * nodes.length)];
        } else {
            // Exploitation: best predicted node
            scoredNodes.sort((a, b) => b.score - a.score);
            return scoredNodes[0].node;
        }
    }

    // Predict node performance using time-series analysis
    predictNodePerformance(nodeName, timestamp) {
        const data = this.timeSeriesData.get(nodeName) || [];
        if (data.length < 5) {
            // Not enough data, return defaults
            return { responseTime: 100, errorRate: 0.01, load: 0.5, confidence: 0.1 };
        }

        // Simple exponential moving average for prediction
        const recentData = data.filter(d => timestamp - d.timestamp < this.predictionWindow);
        if (recentData.length === 0) {
            return { responseTime: 100, errorRate: 0.01, load: 0.5, confidence: 0.1 };
        }

        // Calculate trends
        const responseTimes = recentData.map(d => d.responseTime);
        const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

        const errorRate = recentData.filter(d => !d.success).length / recentData.length;

        // Simple trend analysis (linear regression slope)
        const timePoints = recentData.map((d, i) => i);
        const slope = this.calculateSlope(timePoints, responseTimes);

        // Predict next response time based on trend
        const predictedResponseTime = Math.max(10, avgResponseTime + slope * 5); // Predict 5 steps ahead

        // Estimate load based on recent activity
        const recentActivity = recentData.filter(d => timestamp - d.timestamp < 60000).length; // Last minute
        const predictedLoad = Math.min(1, recentActivity / 100); // Normalize to 0-1

        const confidence = Math.min(1, recentData.length / 20); // Confidence based on data points

        return {
            responseTime: predictedResponseTime,
            errorRate,
            load: predictedLoad,
            confidence
        };
    }

    // Calculate slope for linear regression
    calculateSlope(x, y) {
        const n = x.length;
        if (n < 2) return 0;

        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return isNaN(slope) ? 0 : slope;
    }

    // Record performance data for ML training
    recordPerformanceData(nodeName, responseTime, success, load = 0.5) {
        if (!this.timeSeriesData.has(nodeName)) {
            this.timeSeriesData.set(nodeName, []);
        }

        const data = this.timeSeriesData.get(nodeName);
        data.push({
            timestamp: Date.now(),
            responseTime,
            success,
            load
        });

        // Keep only recent data (last 24 hours)
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const filtered = data.filter(d => d.timestamp > cutoff);
        this.timeSeriesData.set(nodeName, filtered.slice(-1000)); // Keep max 1000 entries
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
            data.redisCacheHits = this.redisCacheHits;
            data.redisCacheMisses = this.redisCacheMisses;
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
           data.tagIndex = {};
           for (const [tag, nodes] of this.tagIndex) {
               data.tagIndex[tag] = Array.from(nodes);
           }
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
                    this.redisCacheHits = data.redisCacheHits || 0;
                    this.redisCacheMisses = data.redisCacheMisses || 0;
                    this.responseTimes = new Map();
                    for (const [node, rt] of Object.entries(data.responseTimes || {})) {
                        this.responseTimes.set(node, rt);
                    }
                    this.tagIndex = new Map();
                    for (const [tag, nodes] of Object.entries(data.tagIndex || {})) {
                        this.tagIndex.set(tag, new Set(nodes));
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
            // Load the entire file into memory for fast access
            this.mmapBuffer = fs.readFileSync(this.registryFile);
            this.mmapFd = fs.openSync(this.registryFile, 'r+');
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
        const tracer = trace.getTracer('maxine-registry-simple', '1.0.0');
        const startTime = Date.now();
        return tracer.startActiveSpan('discover', async (span) => {
            const { version, loadBalancing = 'round-robin', tags = [], ip, proxy } = options;
            span.setAttribute('service.name', serviceName);
            span.setAttribute('load_balancing.strategy', loadBalancing);
            span.setAttribute('service.version', version || 'default');
            span.setAttribute('client.ip', ip || 'unknown');
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
            let node = await this.getRandomNode(fullServiceName, loadBalancing, ip, tags);
            if (node) {
                span.setAttribute('node.selected', node.nodeName);
                span.setAttribute('discovery.result', 'local');
                span.end();
                return node;
            }

            // If not found locally and federation enabled, try peers
            if (config.federationEnabled && config.federationPeers.length > 0) {
                for (const peer of config.federationPeers) {
                    try {
                        const url = `${peer}/discover?serviceName=${encodeURIComponent(fullServiceName)}&loadBalancing=${loadBalancing}&tags=${tags.join(',')}${version ? `&version=${version}` : ''}`;
                        const response = await axios.get(url, { timeout: config.federationTimeout });
                        if (response.data && response.data.address) {
                            // Cache locally? For simplicity, just return
                            span.setAttribute('node.selected', response.data.nodeName);
                            span.setAttribute('discovery.result', 'federated');
                            span.setAttribute('federation.peer', peer);
                            span.end();
                            return { address: response.data.address, nodeName: response.data.nodeName, healthy: true };
                        }
                    } catch (err) {
                        // Ignore errors, try next peer
                    }
                }
            }
            span.setAttribute('discovery.result', 'not_found');
            span.end();
            return null;
        });
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

        // Get call logs for analytics
        getCallLogs() {
            const logs = {};
            for (const [caller, calls] of this.callLogs) {
                logs[caller] = {};
                for (const [called, data] of calls) {
                    logs[caller][called] = { count: data.count, lastSeen: data.lastSeen };
                }
            }
            return logs;
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

            // Record data for ML training (assume success for now, could be enhanced)
            this.recordPerformanceData(nodeId, responseTime, true);

            // Update health score after recording response time
            this.updateHealthScore(nodeId);

            // Update Q-value for AI-driven load balancing
            const serviceName = this.nodeToService.get(nodeId);
            if (serviceName) {
                this.updateQValue(serviceName, nodeId, responseTime, true);
            }
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

        // Record response time for predictive load balancing
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
            // Use pooled entry to reduce object allocation
            let entry = this.responseTimeEntryPool.pop();
            if (!entry) entry = {};
            entry.timestamp = Date.now();
            entry.responseTime = responseTime;
            history.push(entry);

            // Keep only last 100 entries to prevent memory bloat
            if (history.length > 100) {
                const removed = history.shift();
                if (this.responseTimeEntryPool.length < this.poolMaxSize) {
                    this.responseTimeEntryPool.push(removed);
                }
            }

            // Update health score after recording response time
            this.updateHealthScore(nodeId);

            // Update Q-value for AI-driven load balancing
            const serviceName = this.nodeToService.get(nodeId);
            if (serviceName) {
                this.updateQValue(serviceName, nodeId, responseTime, true);
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

        // Calculate trend for predictive load balancing (slope of response times)
        calculateTrend(nodeName) {
            const history = this.responseTimeHistory.get(nodeName);
            if (!history || history.length < 2) return 0; // No trend
            // Use last 10 points for trend
            const recent = history.slice(-10);
            if (recent.length < 2) return 0;
            const n = recent.length;
            const sumX = (n * (n - 1)) / 2;
            const sumY = recent.reduce((sum, entry) => sum + entry.responseTime, 0);
            const sumXY = recent.reduce((sum, entry, i) => sum + i * entry.responseTime, 0);
            const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            return slope;
        }

        // Select node with best predictive trend (most decreasing response time)
        selectPredictive(nodes) {
            let bestNode = null;
            let bestTrend = Infinity; // Lower slope (more negative) is better
            for (const node of nodes) {
                const trend = this.calculateTrend(node.nodeName);
                if (trend < bestTrend) {
                    bestTrend = trend;
                    bestNode = node;
                }
            }
            return bestNode || nodes[(fastRandom() * nodes.length) | 0];
        }

        // AI-Driven Load Balancing using Q-Learning
        selectAIDriven(nodes, clientIP) {
            if (nodes.length === 0) return null;
            if (nodes.length === 1) return nodes[0];

            const serviceName = nodes[0].serviceName; // Assume all nodes have same serviceName
            const qValues = this.qTable.get(serviceName) || new Map();

            // Initialize Q-values if not present
            for (const node of nodes) {
                if (!qValues.has(node.nodeName)) {
                    qValues.set(node.nodeName, 0);
                }
            }
            this.qTable.set(serviceName, qValues);

            // Epsilon-greedy selection
            let selectedNode;
            if (fastRandom() < this.epsilon) {
                // Explore: random selection
                selectedNode = nodes[(fastRandom() * nodes.length) | 0];
            } else {
                // Exploit: select node with highest Q-value
                let maxQ = -Infinity;
                for (const node of nodes) {
                    const q = qValues.get(node.nodeName) || 0;
                    if (q > maxQ) {
                        maxQ = q;
                        selectedNode = node;
                    }
                }
            }

            // Store the selection for reward update later
            // We'll need a way to record response time and update Q-value
            // For now, return selected node
            return selectedNode;
        }

        // Update Q-value for AI-driven load balancing
        updateQValue(serviceName, nodeName, responseTime, success = true) {
            const qValues = this.qTable.get(serviceName);
            if (!qValues) return;

            // Reward: lower response time is better, failure is penalty
            const reward = success ? Math.max(0, 1000 - responseTime) : -100; // Reward for <1s, penalty for failure

            const currentQ = qValues.get(nodeName) || 0;
            // Simple Q-update: Q = Q + alpha * (reward - Q)
            // Since no next state, just immediate reward
             const newQ = currentQ + this.alpha * (reward - currentQ);
             qValues.set(nodeName, newQ);
         }

         // Cost-aware load balancing: prefer lower cost nodes (on-prem over cloud)
         selectCostAware(nodes) {
             if (nodes.length === 0) return null;
             if (nodes.length === 1) return nodes[0];

             // Cost-aware selection: prefer nodes with lower cost priority
             // metadata.costPriority: 'low' (on-prem), 'medium' (hybrid), 'high' (cloud)
             const costPriorities = nodes.map(node => {
                 const priority = node.metadata?.costPriority || 'medium';
                 const costScore = { 'low': 1, 'medium': 2, 'high': 3 }[priority] || 2;
                 return { node, costScore, connections: node.connections || 0 };
             });

             // Sort by cost score (lower is better), then by connections (lower is better)
             costPriorities.sort((a, b) => {
                 if (a.costScore !== b.costScore) return a.costScore - b.costScore;
                 return a.connections - b.connections;
             });

              return costPriorities[0].node;
          }

          selectPowerOfTwoChoices(nodes) {
              if (nodes.length === 0) return null;
              if (nodes.length === 1) return nodes[0];

              // Power of two choices: select two random nodes, pick the one with fewer connections
              const choice1 = nodes[(fastRandom() * nodes.length) | 0];
              const choice2 = nodes[(fastRandom() * nodes.length) | 0];

              // Ensure they are different if possible
              while (nodes.length > 1 && choice1 === choice2) {
                  choice2 = nodes[(fastRandom() * nodes.length) | 0];
              }

              const conn1 = choice1.connections || 0;
              const conn2 = choice2.connections || 0;
              return conn1 <= conn2 ? choice1 : choice2;
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

        // Predict service health using time-series analysis
        predictServiceHealth(serviceName, predictionWindow = 300000) { // 5 minutes default
            const service = this.services.get(serviceName);
            if (!service) return null;

            const predictions = {};
            for (const node of service.healthyNodesArray) {
                const history = this.responseTimeHistory.get(node.nodeName);
                if (history && history.length >= 3) {
                    // Simple linear regression for trend
                    const recent = history.slice(-10); // Last 10 points
                    const n = recent.length;
                    const sumX = (n * (n - 1)) / 2;
                    const sumY = recent.reduce((sum, entry) => sum + entry.responseTime, 0);
                    const sumXY = recent.reduce((sum, entry, i) => sum + i * entry.responseTime, 0);
                    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
                    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

                    // Predict future response time
                    const predictedRT = recent[recent.length - 1].responseTime + slope * (predictionWindow / 60000); // per minute
                    const currentScore = this.healthScores.get(node.nodeName) || 0;

                    // Adjust prediction based on trend
                    let predictedScore = currentScore;
                    if (slope > 5) { // Response time increasing significantly
                        predictedScore = Math.max(0, currentScore - 20);
                    } else if (slope < -2) { // Improving
                        predictedScore = Math.min(100, currentScore + 10);
                    }

                    predictions[node.nodeName] = {
                        currentScore,
                        predictedScore,
                        trend: slope,
                        predictedResponseTime: predictedRT
                    };
                } else {
                    predictions[node.nodeName] = {
                        currentScore: this.healthScores.get(node.nodeName) || 0,
                        predictedScore: null,
                        trend: 0,
                        predictedResponseTime: null
                    };
                }
            }
            return predictions;
        }

        // Enhanced anomaly detection with statistical analysis
        getAnomalies() {
            const anomalies = [];
            const now = Date.now();

            for (const [serviceName, service] of this.services) {
                // Basic health checks
                const failureCount = Array.from(this.circuitFailures.values()).reduce((sum, count) => sum + count, 0);
                if (failureCount > 10) {
                    anomalies.push({ serviceName, type: 'high_circuit_failures', value: failureCount, severity: 'high' });
                }
                if (service.healthyNodesArray.length === 0 && service.nodes.size > 0) {
                    anomalies.push({ serviceName, type: 'no_healthy_nodes', severity: 'critical' });
                }
                if (service.nodes.size === 0) {
                    anomalies.push({ serviceName, type: 'no_nodes', severity: 'critical' });
                }

                // Statistical anomaly detection
                if (service.responseTimes && service.responseTimes.length > 5) {
                    const mean = service.responseTimes.reduce((a, b) => a + b, 0) / service.responseTimes.length;
                    const variance = service.responseTimes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / service.responseTimes.length;
                    const stdDev = Math.sqrt(variance);

                    // Check for response time anomalies (3 sigma rule)
                    const recentResponseTime = service.responseTimes[service.responseTimes.length - 1];
                    if (recentResponseTime > mean + 3 * stdDev) {
                        anomalies.push({
                            serviceName,
                            type: 'high_response_time',
                            value: recentResponseTime,
                            threshold: mean + 3 * stdDev,
                            severity: 'medium'
                        });
                    }

                    // Check for response time trend (increasing)
                    if (service.responseTimes.length >= 10) {
                        const recent = service.responseTimes.slice(-5);
                        const earlier = service.responseTimes.slice(-10, -5);
                        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
                        const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
                        const trend = (recentAvg - earlierAvg) / earlierAvg;

                        if (trend > 0.5) { // 50% increase
                            anomalies.push({
                                serviceName,
                                type: 'response_time_trend',
                                value: trend,
                                severity: 'medium'
                            });
                        }
                    }
                }

                // Check for stale heartbeats
                for (const [nodeId, node] of service.nodes) {
                    if (now - node.lastHeartbeat > this.heartbeatTimeout * 2) {
                        anomalies.push({
                            serviceName,
                            nodeId,
                            type: 'stale_heartbeat',
                            lastSeen: node.lastHeartbeat,
                            severity: 'high'
                        });
                    }
                }

                // Check for high error rates
                if (service.requestCount && service.requestCount > 100) {
                    const errorRate = service.errorCount / service.requestCount;
                    if (errorRate > 0.1) { // 10% error rate
                        anomalies.push({
                            serviceName,
                            type: 'high_error_rate',
                            value: errorRate,
                            severity: 'high'
                        });
                    }
                }
            }

            // Sort by severity
            const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            anomalies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

            return anomalies;
        }

        // Record response time for predictive load balancing
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
            // Use pooled entry to reduce object allocation
            let entry = this.responseTimeEntryPool.pop();
            if (!entry) entry = {};
            entry.timestamp = Date.now();
            entry.responseTime = responseTime;
            history.push(entry);

            // Keep only last 100 entries to prevent memory bloat
            if (history.length > 100) {
                const removed = history.shift();
                if (this.responseTimeEntryPool.length < this.poolMaxSize) {
                    this.responseTimeEntryPool.push(removed);
                }
            }

            // Update health score after recording response time
            this.updateHealthScore(nodeId);

            // Update Q-value for AI-driven load balancing
            const serviceName = this.nodeToService.get(nodeId);
            if (serviceName) {
                this.updateQValue(serviceName, nodeId, responseTime, true);
            }
        }

        // Record a service call for dependency auto-detection
        recordCall(callerService, calledService) {
            try {
                if (!this.callLogs.has(callerService)) {
                    this.callLogs.set(callerService, new Map());
                }
                const serviceCalls = this.callLogs.get(callerService);
                if (!serviceCalls.has(calledService)) {
                    serviceCalls.set(calledService, { count: 0, lastSeen: Date.now() });
                }
                const callData = serviceCalls.get(calledService);
                callData.count++;
                callData.lastSeen = Date.now();
            } catch (error) {
                console.error('Error recording call:', error);
                throw error;
            }
        }

        // Analyze call logs and update dependencies
        analyzeDependencies() {
            const now = Date.now();
            const threshold = config.dependencyCallThreshold;
            const maxAge = config.dependencyMaxAge;

            for (const [caller, calls] of this.callLogs) {
                for (const [called, data] of calls) {
                    if (data.count >= threshold && (now - data.lastSeen) < maxAge) {
                        // Add dependency if not already present
                        if (!this.dependencies.has(caller)) {
                            this.dependencies.set(caller, new Set());
                        }
                        this.dependencies.get(caller).add(called);
                    } else if (data.count < threshold || (now - data.lastSeen) > maxAge) {
                        // Remove stale dependency
                        if (this.dependencies.has(caller)) {
                            this.dependencies.get(caller).delete(called);
                            if (this.dependencies.get(caller).size === 0) {
                                this.dependencies.delete(caller);
                            }
                        }
                    }
                }
            }
        }

        // AI-Driven Load Balancing using Reinforcement Learning
        selectAIDriven(availableNodes, clientIP) {
            if (availableNodes.length === 0) return null;

            const clientId = clientIP || 'default';
            const state = this.createAIState(availableNodes, clientId);

            // Choose action using epsilon-greedy policy
            const action = this.chooseAIAction(state, availableNodes.length);

            const selectedNode = availableNodes[action];

            // Store selection for learning
            this.aiSelections.set(clientId, {
                state,
                action,
                nodeId: selectedNode.nodeName,
                timestamp: Date.now()
            });

            return selectedNode;
        }

        // Create state representation for AI
        createAIState(availableNodes, clientId) {
            // State includes node health scores and response times
            const nodeStates = availableNodes.map(node => {
                const healthScore = this.getHealthScore(null, node.nodeName) || 50;
                const avgResponseTime = this.getAverageResponseTime(node.nodeName) || 100;
                return `${node.nodeName}:${healthScore}:${avgResponseTime}`;
            }).sort().join('|');

            return `${clientId}:${nodeStates}`;
        }

        // Choose action using epsilon-greedy
        chooseAIAction(state, numActions) {
            if (Math.random() < this.epsilon) {
                // Explore: random action
                return Math.floor(Math.random() * numActions);
            } else {
                // Exploit: best action based on Q-values
                return this.getBestAIAction(state, numActions);
            }
        }

        // Get best action based on Q-values
        getBestAIAction(state, numActions) {
            if (!this.qTable.has(state)) {
                // Initialize Q-values
                this.qTable.set(state, new Array(numActions).fill(0));
            }

            const qValues = this.qTable.get(state);
            let bestAction = 0;
            let bestValue = qValues[0];

            for (let i = 1; i < qValues.length; i++) {
                if (qValues[i] > bestValue) {
                    bestValue = qValues[i];
                    bestAction = i;
                }
            }

            return bestAction;
        }

        // Update Q-values based on response
        updateQValue(serviceName, nodeId, responseTime, success) {
            // Find the client that selected this node recently
            for (const [clientId, selection] of this.aiSelections) {
                if (selection.nodeId === nodeId && (Date.now() - selection.timestamp) < 60000) { // 1 minute window
                    const reward = success ? Math.max(0, 100 - responseTime / 10) : -50;

                    const { state, action } = selection;
                    if (this.qTable.has(state)) {
                        const qValues = this.qTable.get(state);
                        if (action < qValues.length) {
                            const oldQValue = qValues[action];
                            // Simple Q-learning update (simplified, no next state)
                            const newQValue = oldQValue + this.alpha * (reward - oldQValue);
                            qValues[action] = newQValue;
                            this.qTable.set(state, qValues);
                        }
                    }

                    // Clean up old selection
                    this.aiSelections.delete(clientId);
                    break; // Only update one client per response
                }
            }
        }
}

module.exports = { LightningServiceRegistrySimple };