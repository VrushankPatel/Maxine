// Lightning-fast service registry for minimal overhead
const config = require('../config/config');
const { LRUCache } = require('lru-cache');
const { trace, metrics } = require('@opentelemetry/api');

class LightningServiceRegistry {
    constructor() {
        this.services = new Map(); // serviceName -> { nodes: Map<nodeName, node>, healthyNodes: Set<node>, healthyNodesArray: [], availableNodesArray: [], roundRobinIndex: 0, minConnectionNode: null, minConnectionCount: 0, minResponseTimeNode: null, minResponseTime: Infinity, connectionSortedNodes: [], responseTimeSortedNodes: [] }
        this.lastHeartbeats = new Map(); // nodeName -> timestamp
        this.nodeToService = new Map(); // nodeName -> serviceName
        this.activeConnections = new Map(); // nodeName -> count for least-connections
        this.responseTimes = new Map(); // nodeName -> average response time for LRT
        this.circuitFailures = new Map(); // nodeName -> failure count
        this.circuitState = new Map(); // nodeName -> 'closed' | 'open' | 'half-open'
        this.circuitLastFailure = new Map(); // nodeName -> timestamp
        this.canaryConfigs = new Map();
        this.blueGreenConfigs = new Map();
        this.roundRobinIndex = new Map(); // for canary and blue-green
        this.aliases = new Map(); // alias -> serviceName
        this.maintenanceNodes = new Set(); // nodeName in maintenance
        this.stickyAssignments = new Map(); // clientId -> nodeName
        this.kvStore = new Map(); // simple KV store
        this.tagIndex = new Map(); // tag -> Set<nodeName>
        this.versionIndex = new Map(); // version -> Set<nodeName>
        this.environmentIndex = new Map(); // environment -> Set<nodeName>
        this.federatedRegistries = new Map(); // federation support
        this.dependencies = new Map(); // service dependencies
        this.callLogs = new Map(); // serviceName -> Map<calledService, {count, lastSeen}>
        this.heartbeatTimeout = 60000; // 60 seconds
        this.circuitBreakerThreshold = 5;
        this.circuitBreakerTimeout = 60000;
        this.discoveryCache = new LRUCache({ max: 50000, maxAge: 15000 }); // 15 second cache for better performance and freshness
        this.cacheTTL = 15000;

        // Adaptive caching with ML-inspired access pattern analysis
        this.accessPatterns = new Map(); // service -> { count, lastAccess, emaFrequency }
        this.adaptiveCacheEnabled = true;
        this.baseTTL = 15000;
        this.maxTTL = 300000; // 5 minutes max
        this.emaAlpha = 0.1; // Smoothing factor for exponential moving average

        // Cached metrics for fast access
        this._totalServices = 0;
        this._totalNodes = 0;
        this._totalActiveConnections = 0;
        this._averageResponseTime = 0;

        // SIMD-inspired fast operations for load balancing
        this.fastMin = (values) => {
            if (values.length === 0) return Infinity;
            if (values.length === 1) return values[0];
            let min = values[0];
            // SIMD-inspired: process 4 elements at a time for better CPU utilization
            const len = values.length;
            for (let i = 1; i < len; i += 4) {
                if (i < len) min = Math.min(min, values[i]);
                if (i + 1 < len) min = Math.min(min, values[i + 1]);
                if (i + 2 < len) min = Math.min(min, values[i + 2]);
                if (i + 3 < len) min = Math.min(min, values[i + 3]);
            }
            return min;
        };

        this.fastSum = (values) => {
            let sum = 0;
            // SIMD-inspired parallel accumulation
            const len = values.length;
            for (let i = 0; i < len; i += 4) {
                if (i < len) sum += values[i];
                if (i + 1 < len) sum += values[i + 1];
                if (i + 2 < len) sum += values[i + 2];
                if (i + 3 < len) sum += values[i + 3];
            }
            return sum;
        };

        // Adaptive caching methods
        this.updateAccessPattern = (serviceName) => {
            if (!this.adaptiveCacheEnabled) return this.baseTTL;

            const now = Date.now();
            let pattern = this.accessPatterns.get(serviceName);
            if (!pattern) {
                pattern = { count: 0, lastAccess: now, emaFrequency: 0 };
                this.accessPatterns.set(serviceName, pattern);
            }

            pattern.count++;
            const timeDiff = now - pattern.lastAccess;
            if (timeDiff > 0) {
                const instantFrequency = 1000 / timeDiff; // accesses per second
                pattern.emaFrequency = this.emaAlpha * instantFrequency + (1 - this.emaAlpha) * pattern.emaFrequency;
            }
            pattern.lastAccess = now;

            // Compute adaptive TTL: base + frequency bonus, capped at max
            const adaptiveTTL = Math.min(this.baseTTL + (pattern.emaFrequency * 10000), this.maxTTL);
            return adaptiveTTL;
        };

        this.getAdaptiveTTL = (serviceName) => {
            const pattern = this.accessPatterns.get(serviceName);
            if (!pattern) return this.baseTTL;
            return Math.min(this.baseTTL + (pattern.emaFrequency * 10000), this.maxTTL);
        };

        // OpenTelemetry metrics
        if (global.meter) {
            this.meter = global.meter;
            this.registerCounter = this.meter.createCounter('maxine_service_register_total', { description: 'Total number of service registrations' });
            this.discoverCounter = this.meter.createCounter('maxine_service_discover_total', { description: 'Total number of service discoveries' });
            this.heartbeatCounter = this.meter.createCounter('maxine_service_heartbeat_total', { description: 'Total number of heartbeats' });
            this.deregisterCounter = this.meter.createCounter('maxine_service_deregister_total', { description: 'Total number of service deregistrations' });
            this.cacheHitCounter = this.meter.createCounter('maxine_cache_hit_total', { description: 'Total cache hits' });
            this.cacheMissCounter = this.meter.createCounter('maxine_cache_miss_total', { description: 'Total cache misses' });
            this.servicesGauge = this.meter.createObservableGauge('maxine_services_total', { description: 'Total number of services' });
            this.nodesGauge = this.meter.createObservableGauge('maxine_nodes_total', { description: 'Total number of nodes' });

            // Register gauge callbacks
            this.meter.addBatchObservableCallback((observableResult) => {
                observableResult.observe(this.servicesGauge, this.services.size);
                observableResult.observe(this.nodesGauge, Array.from(this.services.values()).reduce((sum, s) => sum + s.nodes.size, 0));
            }, [this.servicesGauge, this.nodesGauge]);
        }

        // Persistence enabled in lightning mode
        this.persistenceEnabled = config.persistenceEnabled;

        // Periodic cleanup - optimized for lightning fast performance
        setInterval(() => this.cleanup(), 10000); // every 10 seconds for reduced CPU usage

        // Load from disk if enabled
        this.loadFromDisk();

        // Periodic save to disk
        if (this.persistenceEnabled) {
            setInterval(() => this.saveToDiskAsync(), 60000); // every minute
        }

        // Health checks enabled if configured
        if (config.healthCheckEnabled) {
            setInterval(() => this.performHealthChecks(), this.healthCheckInterval);
        }

        // Periodic dependency analysis
        if (config.dependencyAutoDetectEnabled) {
            setInterval(() => this.analyzeDependencies(), config.dependencyAnalysisInterval);
        }

        // Strategies for load balancing
        this.strategies = {
            'round-robin': (service, availableNodes, clientId) => {
                if (availableNodes.length === 0) return null;
                let index = service.roundRobinIndex || 0;
                const node = availableNodes[index];
                service.roundRobinIndex = (index + 1) % availableNodes.length;
                return node;
            },
            'least-connections': (service, availableNodes, clientId) => {
                if (availableNodes.length === 0) return null;
                if (service.minConnectionNode && availableNodes.includes(service.minConnectionNode)) {
                    return service.minConnectionNode;
                }
                return availableNodes[0];
            },
            'lrt': (service, availableNodes, clientId) => {
                if (availableNodes.length === 0) return null;
                if (service.minResponseTimeNode && availableNodes.includes(service.minResponseTimeNode)) {
                    return service.minResponseTimeNode;
                }
                // SIMD-inspired fast min for response times
                const times = availableNodes.map(node => this.responseTimes.get(node.nodeName) || 0);
                const minTime = this.fastMin(times);
                // Find the node with min time (first occurrence)
                for (const node of availableNodes) {
                    if ((this.responseTimes.get(node.nodeName) || 0) === minTime) {
                        return node;
                    }
                }
                return availableNodes[0];
            },
            'random': (service, availableNodes, clientId) => {
                if (availableNodes.length === 0) return null;
                const randomIndex = Math.floor(Math.random() * availableNodes.length);
                return availableNodes[randomIndex];
            },
            'hash': (service, availableNodes, clientId) => {
                if (availableNodes.length === 0) return null;
                if (!clientId) return availableNodes[0];
                const hash = this.simpleHash(clientId);
                const index = hash % availableNodes.length;
                return availableNodes[index];
            },
            'weighted': (service, availableNodes, clientId) => {
                if (availableNodes.length === 0) return null;
                const weights = availableNodes.map(n => n.metadata?.weight || 1);
                const cumulative = [];
                let sum = 0;
                for (const w of weights) {
                    sum += w;
                    cumulative.push(sum);
                }
                const rand = Math.random() * sum;
                // Binary search for the index
                let low = 0, high = cumulative.length - 1;
                while (low < high) {
                    const mid = Math.floor((low + high) / 2);
                    if (cumulative[mid] < rand) {
                        low = mid + 1;
                    } else {
                        high = mid;
                    }
                }
                return availableNodes[low];
            },
            'power-of-two-choices': (service, availableNodes, clientId) => {
                if (availableNodes.length < 2) return availableNodes[0] || null;
                const idx1 = Math.floor(Math.random() * availableNodes.length);
                let idx2 = Math.floor(Math.random() * availableNodes.length);
                while (idx2 === idx1) idx2 = Math.floor(Math.random() * availableNodes.length);
                const node1 = availableNodes[idx1];
                const node2 = availableNodes[idx2];
                const conn1 = this.activeConnections.get(node1.nodeName) || 0;
                const conn2 = this.activeConnections.get(node2.nodeName) || 0;
                return conn1 <= conn2 ? node1 : node2;
            },
            'adaptive': (service, availableNodes, clientId) => {
                if (availableNodes.length === 0) return null;
                const sampleSize = Math.min(5, availableNodes.length); // Reduced sample size for speed
                const sampledNodes = [];
                const indices = new Set();
                while (indices.size < sampleSize) {
                    const idx = Math.floor(Math.random() * availableNodes.length);
                    if (!indices.has(idx)) {
                        indices.add(idx);
                        sampledNodes.push(availableNodes[idx]);
                    }
                }
                // SIMD-inspired fast min for scores
                const scores = sampledNodes.map(node => {
                    const time = this.responseTimes.get(node.nodeName) || 0;
                    const conn = this.activeConnections.get(node.nodeName) || 0;
                    return time + conn * 10;
                });
                const minScore = this.fastMin(scores);
                // Find the node with min score
                for (let i = 0; i < sampledNodes.length; i++) {
                    if (scores[i] === minScore) {
                        return sampledNodes[i];
                    }
                }
                return sampledNodes[0];
            },
            'sticky-round-robin': (service, availableNodes, clientId) => {
                if (availableNodes.length === 0) return null;
                if (clientId) {
                    const assigned = this.stickyAssignments.get(clientId);
                    if (assigned && availableNodes.some(n => n.nodeName === assigned)) {
                        return availableNodes.find(n => n.nodeName === assigned);
                    } else {
                        const index = this.simpleHash(clientId) % availableNodes.length;
                        const node = availableNodes[index];
                        this.stickyAssignments.set(clientId, node.nodeName);
                        return node;
                    }
                } else {
                    let index = service.roundRobinIndex || 0;
                    const node = availableNodes[index % availableNodes.length];
                    service.roundRobinIndex = (index + 1) % availableNodes.length;
                    return node;
                }
            }
        };
    }

    register(serviceName, nodeInfo, namespace = "default", datacenter = "default") {
        const tracer = trace.getTracer('maxine-registry', '1.0.0');
        return tracer.startActiveSpan('register', (span) => {
            span.setAttribute('service.name', serviceName);
            span.setAttribute('node.host', nodeInfo.host);
            span.setAttribute('node.port', nodeInfo.port);
            span.setAttribute('namespace', namespace);
            span.setAttribute('datacenter', datacenter);

            try {
                const fullServiceName = datacenter !== "default" ? `${datacenter}:${namespace}:${serviceName}` : `${namespace}:${serviceName}`;
                const nodeName = `${nodeInfo.host}:${nodeInfo.port}`;
                const node = { ...nodeInfo, nodeName, address: `${nodeInfo.host}:${nodeInfo.port}`, tags: nodeInfo.tags || [], version: nodeInfo.version, environment: nodeInfo.environment };

        if (!this.services.has(fullServiceName)) {
            this.services.set(fullServiceName, { nodes: new Map(), healthyNodes: new Set(), healthyNodesArray: [], availableNodesArray: [], roundRobinIndex: 0, minConnectionNode: null, minConnectionCount: 0, minResponseTimeNode: null, minResponseTime: Infinity, connectionSortedNodes: [], responseTimeSortedNodes: [] });
        }
        const service = this.services.get(fullServiceName);
        if (service.nodes.has(nodeName)) {
            // Already registered, just update heartbeat
            this.lastHeartbeats.set(nodeName, Date.now());
            return nodeName;
        }
        service.nodes.set(nodeName, node);
        service.healthyNodes.add(node);
        service.healthyNodesArray.push(node);
        if (!this.isCircuitOpen(fullServiceName, nodeName) && !this.maintenanceNodes.has(nodeName)) {
            service.availableNodesArray.push(node);
        }
        this.nodeToService.set(nodeName, fullServiceName);
        this.lastHeartbeats.set(nodeName, Date.now());

         // Add to indexes if not lightning mode
         if (!config.lightningMode) {
             // Add to tag index
             if (node.tags && node.tags.length > 0) {
                 for (const tag of node.tags) {
                     if (!this.tagIndex.has(tag)) {
                         this.tagIndex.set(tag, new Set());
                     }
                     this.tagIndex.get(tag).add(nodeName);
                 }
             }

             // Add to version index
             if (node.version) {
                 if (!this.versionIndex.has(node.version)) {
                     this.versionIndex.set(node.version, new Set());
                 }
                 this.versionIndex.get(node.version).add(nodeName);
             }

             // Add to environment index
             if (node.environment) {
                 if (!this.environmentIndex.has(node.environment)) {
                     this.environmentIndex.set(node.environment, new Set());
                 }
                 this.environmentIndex.get(node.environment).add(nodeName);
             }
         }

                 // Update min connection node if this is the first or has fewer connections
                 const connCount = this.activeConnections.get(nodeName) || 0;
                 if (service.minConnectionNode === null || connCount < service.minConnectionCount) {
                     service.minConnectionNode = node;
                     service.minConnectionCount = connCount;
                 }

                 // Increment register counter
                 if (this.registerCounter) {
                     this.registerCounter.add(1, { service: serviceName });
                 }

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

    addToHealthyNodes(serviceName, nodeName) {
        const service = this.services.get(serviceName);
        if (!service) return;
        const node = service.nodes.get(nodeName);
        if (!node) return;
        if (!service.healthyNodes.has(node)) {
            service.healthyNodes.add(node);
            service.healthyNodesArray.push(node);
            if (!this.isCircuitOpen(serviceName, nodeName) && !this.maintenanceNodes.has(nodeName)) {
                service.availableNodesArray.push(node);
            }
        }
    }

    deregister(serviceName, nodeName) {
        const tracer = trace.getTracer('maxine-registry', '1.0.0');
        return tracer.startActiveSpan('deregister', (span) => {
            span.setAttribute('service.name', serviceName);
            span.setAttribute('node.name', nodeName);

            try {
                const service = this.services.get(serviceName);
                if (service) {
                    const node = service.nodes.get(nodeName);
                    if (node) {
                        service.nodes.delete(nodeName);
                        service.healthyNodes.delete(node);
                        // Remove from healthyNodesArray
                        const healthyIndex = service.healthyNodesArray.findIndex(n => n.nodeName === nodeName);
                        if (healthyIndex !== -1) {
                            service.healthyNodesArray.splice(healthyIndex, 1);
                        }
                        // Remove from availableNodesArray
                        const availableIndex = service.availableNodesArray.findIndex(n => n.nodeName === nodeName);
                        if (availableIndex !== -1) {
                            service.availableNodesArray.splice(availableIndex, 1);
                        }
                    }
                    if (service.nodes.size === 0) {
                        this.services.delete(serviceName);
                    } else {
                        // Update min connection node if it was the deregistered one
                        if (service.minConnectionNode && service.minConnectionNode.nodeName === nodeName) {
                            this._updateMinConnectionNode(service);
                        }
                        // Update min response time node if it was the deregistered one
                        if (service.minResponseTimeNode && service.minResponseTimeNode.nodeName === nodeName) {
                            this._updateMinResponseTimeNode(service);
                        }
                        // Reset roundRobinIndex if out of bounds
                        if (service.roundRobinIndex >= service.availableNodesArray.length) {
                            service.roundRobinIndex = 0;
                        }
                    }
                }
                this.lastHeartbeats.delete(nodeName);
                this.nodeToService.delete(nodeName);
                this.activeConnections.delete(nodeName);
                this.maintenanceNodes.delete(nodeName);

         // Remove from indexes if not lightning mode
         if (!config.lightningMode) {
             // Remove from tag index
             if (node && node.tags && node.tags.length > 0) {
                 for (const tag of node.tags) {
                     const tagSet = this.tagIndex.get(tag);
                     if (tagSet) {
                         tagSet.delete(nodeName);
                         if (tagSet.size === 0) {
                             this.tagIndex.delete(tag);
                         }
                     }
                 }
             }

             // Remove from version index
             if (node && node.version) {
                 const verSet = this.versionIndex.get(node.version);
                 if (verSet) {
                     verSet.delete(nodeName);
                     if (verSet.size === 0) this.versionIndex.delete(node.version);
                 }
             }

                      // Remove from environment index
                      if (node && node.environment) {
                          const envSet = this.environmentIndex.get(node.environment);
                          if (envSet) {
                              envSet.delete(nodeName);
                              if (envSet.size === 0) this.environmentIndex.delete(node.environment);
                          }
                      }
                   }
                 }

                 // Increment deregister counter
                 if (this.deregisterCounter) {
                     this.deregisterCounter.add(1, { service: serviceName, node: nodeName });
                 }

                 span.end();
            } catch (error) {
                span.recordException(error);
                span.setStatus({ code: 2, message: error.message });
                span.end();
                throw error;
            }
        });
    }

    _updateMinConnectionNode(service) {
        if (service.healthyNodes.size === 0) {
            service.minConnectionNode = null;
            service.minConnectionCount = 0;
            return;
        }
        let minNode = null;
        let minCount = Infinity;
        for (const node of service.healthyNodes) {
            const count = this.activeConnections.get(node.nodeName) || 0;
            if (count < minCount) {
                minCount = count;
                minNode = node;
            }
        }
        service.minConnectionNode = minNode;
        service.minConnectionCount = minCount;
    }

    _updateMinResponseTimeNode(service) {
        if (service.healthyNodes.size === 0) {
            service.minResponseTimeNode = null;
            service.minResponseTime = Infinity;
            return;
        }
        let minNode = null;
        let minTime = Infinity;
        for (const node of service.healthyNodes) {
            const time = this.responseTimes.get(node.nodeName) || 0;
            if (time < minTime) {
                minTime = time;
                minNode = node;
            }
        }
        service.minResponseTimeNode = minNode;
        service.minResponseTime = minTime;
    }

    heartbeat(nodeId) {
        if (this.lastHeartbeats.has(nodeId)) {
            this.lastHeartbeats.set(nodeId, Date.now());
            if (this.heartbeatCounter) {
                this.heartbeatCounter.add(1, { node: nodeId });
            }
            return true;
        }
        return false;
    }

    getRandomNode(serviceName, strategy = 'round-robin', clientId = null, tags = [], version = null, environment = null) {
        const tracer = trace.getTracer('maxine-registry', '1.0.0');
        return tracer.startActiveSpan('getRandomNode', (span) => {
            span.setAttribute('service.name', serviceName);
            span.setAttribute('strategy', strategy);
            span.setAttribute('client.id', clientId || '');
            span.setAttribute('tags', tags.join(','));
            span.setAttribute('version', version || '');
            span.setAttribute('environment', environment || '');

            try {
                // Resolve alias
                if (!this.services.has(serviceName)) {
                    serviceName = this.aliases.get(serviceName) || serviceName;
                }

                const cacheKey = `${serviceName}:${strategy}:${clientId || ''}:${tags.join(',')}:${version || ''}:${environment || ''}`;
                const cached = this.discoveryCache.get(cacheKey);
                if (cached) {
                    // Update access pattern for adaptive caching
                    this.updateAccessPattern(serviceName);
                    if (this.cacheHitCounter) {
                        this.cacheHitCounter.add(1, { service: serviceName, strategy });
                    }
                    span.end();
                    return cached.node || cached;
                }

                const service = this.services.get(serviceName);
                if (!service || service.availableNodesArray.length === 0) {
                    span.end();
                    return null;
                }

                // availableNodesArray already excludes maintenance and open circuits
                let availableNodes = service.availableNodesArray;
                if (availableNodes.length === 0) {
                    span.end();
                    return null;
                }

        // Combined filtering using indexes for O(1) performance if not lightning mode
        if (!config.lightningMode && (tags.length > 0 || version || environment)) {
            let candidateNodeNames = new Set(availableNodes.map(n => n.nodeName));
            if (tags.length > 0) {
                for (const tag of tags) {
                    const tagSet = this.tagIndex.get(tag);
                    if (!tagSet) {
                        candidateNodeNames = new Set(); // no nodes have this tag
                        break;
                    }
                    // Intersect
                    const newCandidates = new Set();
                    for (const nodeName of candidateNodeNames) {
                        if (tagSet.has(nodeName)) {
                            newCandidates.add(nodeName);
                        }
                    }
                    candidateNodeNames = newCandidates;
                }
            }
            if (version) {
                const verSet = this.versionIndex.get(version);
                if (verSet) {
                    const newCandidates = new Set();
                    for (const nodeName of candidateNodeNames) {
                        if (verSet.has(nodeName)) {
                            newCandidates.add(nodeName);
                        }
                    }
                    candidateNodeNames = newCandidates;
                } else {
                    candidateNodeNames = new Set(); // no nodes have this version
                }
            }
            if (environment) {
                const envSet = this.environmentIndex.get(environment);
                if (envSet) {
                    const newCandidates = new Set();
                    for (const nodeName of candidateNodeNames) {
                        if (envSet.has(nodeName)) {
                            newCandidates.add(nodeName);
                        }
                    }
                    candidateNodeNames = newCandidates;
                } else {
                    candidateNodeNames = new Set(); // no nodes have this environment
                }
            }
                availableNodes = availableNodes.filter(node => candidateNodeNames.has(node.nodeName));
            }
            if (availableNodes.length === 0) {
                span.end();
                return null;
            }

                // Update access pattern for cache miss
                const adaptiveTTL = this.updateAccessPattern(serviceName);

                // Check for blue-green deployment
                const bgNode = this.getBlueGreenNode(serviceName);
                if (bgNode && !this.isCircuitOpen(serviceName, bgNode.nodeName)) {
                    this.discoveryCache.set(cacheKey, bgNode, { ttl: adaptiveTTL });
                    span.end();
                    return bgNode;
                }

                // Check for canary deployment
                const canaryConfig = this.canaryConfigs.get(serviceName);
                if (canaryConfig) {
                    if (Math.random() * 100 < canaryConfig.percentage) {
                        const canaryNode = this.getCanaryNode(serviceName);
                        if (canaryNode && !this.isCircuitOpen(serviceName, canaryNode.nodeName)) {
                            this.discoveryCache.set(cacheKey, canaryNode, { ttl: adaptiveTTL });
                            span.end();
                            return canaryNode;
                        }
                    }
                }

                // Use strategy
                const strategyFunc = this.strategies[strategy];
                let node;
                if (strategyFunc) {
                    node = strategyFunc(service, availableNodes, clientId);
                    if (node) {
                        this.discoveryCache.set(cacheKey, node, { ttl: adaptiveTTL });
                    }
                 } else {
                     node = this.strategies['round-robin'](service, availableNodes, clientId);
                     if (node) {
                         this.discoveryCache.set(cacheKey, node, { ttl: adaptiveTTL });
                     }
                 }

                 // Increment counters
                 if (this.discoverCounter) {
                     this.discoverCounter.add(1, { service: serviceName, strategy });
                 }
                 if (!cached && this.cacheMissCounter) {
                     this.cacheMissCounter.add(1, { service: serviceName, strategy });
                 }

                 span.end();
                 return node;
            } catch (error) {
                span.recordException(error);
                span.setStatus({ code: 2, message: error.message });
                span.end();
                throw error;
            }
        });
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    setCanary(serviceName, percentage, canaryNodes) {
        this.canaryConfigs.set(serviceName, { percentage, canaryNodes });
    }

    setBlueGreen(serviceName, blueNodes, greenNodes, activeColor = 'blue') {
        this.blueGreenConfigs.set(serviceName, { blueNodes, greenNodes, activeColor });
    }

    getBlueGreenNode(serviceName) {
        const bgConfig = this.blueGreenConfigs.get(serviceName);
        if (!bgConfig) return null;
        const activeNodes = bgConfig.activeColor === 'blue' ? bgConfig.blueNodes : bgConfig.greenNodes;
        if (!activeNodes || activeNodes.length === 0) return null;
        let index = this.roundRobinIndex.get(`${serviceName}-bluegreen`) || 0;
        const nodeName = activeNodes[index % activeNodes.length];
        this.roundRobinIndex.set(`${serviceName}-bluegreen`, index + 1);
        const service = this.services.get(serviceName);
        const node = service && service.nodes.get(nodeName);
        return node && !this.isCircuitOpen(serviceName, node.nodeName) ? node : null;
    }

    getCanaryNode(serviceName) {
        const config = this.canaryConfigs.get(serviceName);
        if (!config) return null;
        const service = this.services.get(serviceName);
        if (!service || service.healthyNodesArray.length === 0) return null;
        const canaryNodes = service.healthyNodesArray.filter(node => config.canaryNodes.includes(node.nodeName) && !this.isCircuitOpen(serviceName, node.nodeName));
        if (canaryNodes.length === 0) return null;
        let index = this.roundRobinIndex.get(`${serviceName}-canary`) || 0;
        const node = canaryNodes[index % canaryNodes.length];
        this.roundRobinIndex.set(`${serviceName}-canary`, index + 1);
        return node;
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
            const serviceName = this.nodeToService.get(nodeName);
            if (serviceName) {
                this.deregister(serviceName, nodeName);
            }
        }
    }

    // Methods to update active connections and maintain min connection tracking
    incrementActiveConnections(serviceName, nodeName) {
        const current = this.activeConnections.get(nodeName) || 0;
        this.activeConnections.set(nodeName, current + 1);
        this._updateMinConnectionForService(serviceName);
    }

    decrementActiveConnections(serviceName, nodeName) {
        const current = this.activeConnections.get(nodeName) || 0;
        if (current > 0) {
            this.activeConnections.set(nodeName, current - 1);
            this._updateMinConnectionForService(serviceName);
        }
    }

    _updateMinConnectionForService(serviceName) {
        const service = this.services.get(serviceName);
        if (service) {
            this._updateMinConnectionNode(service);
        }
    }

    recordResponseTime(serviceName, nodeName, latency) {
        const current = this.responseTimes.get(nodeName) || 0;
        // Simple moving average
        const newTime = (current + latency) / 2;
        this.responseTimes.set(nodeName, newTime);
        // Update min response time node
        const service = this.services.get(serviceName);
        if (service) {
            this._updateMinResponseTimeNode(service);
        }
    }

    incrementCircuitFailures(serviceName, nodeName) {
        const current = this.circuitFailures.get(nodeName) || 0;
        this.circuitFailures.set(nodeName, current + 1);
        this.circuitLastFailure.set(nodeName, Date.now());
        if (current + 1 >= this.circuitBreakerThreshold) {
            this.circuitState.set(nodeName, 'open');
            // Remove from available
            const service = this.services.get(serviceName);
            if (service) {
                const index = service.availableNodesArray.findIndex(n => n.nodeName === nodeName);
                if (index !== -1) service.availableNodesArray.splice(index, 1);
            }
        }
    }

    onCircuitSuccess(serviceName, nodeName) {
        this.circuitFailures.set(nodeName, 0);
        this.circuitState.set(nodeName, 'closed');
        // Add back to available if not maintenance
        const service = this.services.get(serviceName);
        if (service && !this.maintenanceNodes.has(nodeName)) {
            const node = service.nodes.get(nodeName);
            if (node && service.healthyNodes.has(node) && !service.availableNodesArray.some(n => n.nodeName === nodeName)) {
                service.availableNodesArray.push(node);
            }
        }
    }

    isCircuitOpen(serviceName, nodeName) {
        const state = this.circuitState.get(nodeName) || 'closed';
        if (state === 'open') {
            const lastFailure = this.circuitLastFailure.get(nodeName);
            if (lastFailure && Date.now() - lastFailure > this.circuitBreakerTimeout) {
                this.circuitState.set(nodeName, 'half-open');
                // Add to available
                const service = this.services.get(serviceName);
                if (service && !this.maintenanceNodes.has(nodeName)) {
                    const node = service.nodes.get(nodeName);
                    if (node && service.healthyNodes.has(node) && !service.availableNodesArray.some(n => n.nodeName === nodeName)) {
                        service.availableNodesArray.push(node);
                    }
                }
                return false; // Allow one request
            }
            return true;
        }
        return false;
    }

    performHealthChecks() {
        const http = require('http');
        const https = require('https');
        for (const [serviceName, service] of this.services) {
            for (const node of service.healthyNodes) {
                const url = node.metadata && node.metadata.healthEndpoint ? `${node.address}${node.metadata.healthEndpoint}` : node.address;
                const protocol = url.startsWith('https') ? https : http;
                const req = protocol.get(url, (res) => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        this.onCircuitSuccess(serviceName, node.nodeName);
                    } else {
                        this.incrementCircuitFailures(serviceName, node.nodeName);
                    }
                });
                req.on('error', () => {
                    this.incrementCircuitFailures(serviceName, node.nodeName);
                });
                req.setTimeout(5000, () => {
                    req.destroy();
                    this.incrementCircuitFailures(serviceName, node.nodeName);
                });
            }
        }
    }

    setAlias(alias, serviceName) {
        this.aliases.set(alias, serviceName);
    }

    getAlias(alias) {
        return this.aliases.get(alias);
    }

    setMaintenance(nodeName, inMaintenance) {
        const serviceName = this.nodeToService.get(nodeName);
        if (!serviceName) return;
        const service = this.services.get(serviceName);
        if (!service) return;
        if (inMaintenance) {
            this.maintenanceNodes.add(nodeName);
            const index = service.availableNodesArray.findIndex(n => n.nodeName === nodeName);
            if (index !== -1) service.availableNodesArray.splice(index, 1);
        } else {
            this.maintenanceNodes.delete(nodeName);
            const node = service.nodes.get(nodeName);
            if (node && service.healthyNodes.has(node) && !this.isCircuitOpen(serviceName, nodeName) && !service.availableNodesArray.some(n => n.nodeName === nodeName)) {
                service.availableNodesArray.push(node);
            }
        }
    }

    setKV(key, value) {
        this.kvStore.set(key, value);
    }

    getKV(key) {
        return this.kvStore.get(key);
    }

    getServices() {
        return Array.from(this.services.keys());
    }

    getServiceNodes(serviceName) {
        const service = this.services.get(serviceName);
        return service ? Array.from(service.healthyNodes) : [];
    }

    // Federation support
    addFederatedRegistry(name, url) {
        this.federatedRegistries.set(name, url);
    }

    removeFederatedRegistry(name) {
        this.federatedRegistries.delete(name);
    }

    getFederatedNode(serviceName, strategy = 'round-robin', clientId = null) {
        // Simple federation: query other registries if not found locally
        if (this.services.has(serviceName)) {
            return this.getRandomNode(serviceName, strategy, clientId);
        }
        for (const [name, url] of this.federatedRegistries) {
            try {
                // In real implementation, use HTTP client to query federated registry
                // For now, return null
                return null;
            } catch (e) {
                continue;
            }
        }
        return null;
    }



    // Dependency mapping
    addDependency(serviceName, dependsOn) {
        if (!this.dependencies.has(serviceName)) {
            this.dependencies.set(serviceName, new Set());
        }
        this.dependencies.get(serviceName).add(dependsOn);
    }

    removeDependency(serviceName, dependsOn) {
        const deps = this.dependencies.get(serviceName);
        if (deps) {
            deps.delete(dependsOn);
        }
    }

    getDependencies(serviceName) {
        return this.dependencies.get(serviceName) || new Set();
    }

    getDependents(serviceName) {
        const dependents = new Set();
        for (const [svc, deps] of this.dependencies) {
            if (deps.has(serviceName)) {
                dependents.add(svc);
            }
        }
        return dependents;
    }

    async saveToDiskAsync() {
        if (!this.persistenceEnabled) return;
        try {
            const fs = require('fs').promises;
            const path = require('path');
              const data = {
                  services: {},
                  lastHeartbeats: Object.fromEntries(this.lastHeartbeats),
                  nodeToService: Object.fromEntries(this.nodeToService),
                  activeConnections: Object.fromEntries(this.activeConnections),
                  canaryConfigs: Object.fromEntries(this.canaryConfigs),
                  blueGreenConfigs: Object.fromEntries(this.blueGreenConfigs),
                  roundRobinIndex: Object.fromEntries(this.roundRobinIndex),
                  aliases: Object.fromEntries(this.aliases),
                  maintenanceNodes: Array.from(this.maintenanceNodes),
                  stickyAssignments: Object.fromEntries(this.stickyAssignments),
                  kvStore: Object.fromEntries(this.kvStore)
              };
            for (const [serviceName, service] of this.services) {
                  data.services[serviceName] = {
                      nodes: Object.fromEntries(service.nodes),
                      roundRobinIndex: service.roundRobinIndex
                  };
               }
               if (!config.lightningMode) {
                   data.tagIndex = Object.fromEntries(this.tagIndex);
                   data.versionIndex = Object.fromEntries(this.versionIndex);
                   data.environmentIndex = Object.fromEntries(this.environmentIndex);
               }
               await fs.writeFile(path.join(process.cwd(), 'registry.json'), JSON.stringify(data));
        } catch (err) {
            console.error('Failed to save registry to disk:', err);
        }
    }

    loadFromDisk() {
        if (!this.persistenceEnabled) return;
        try {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(process.cwd(), 'registry.json');
            if (!fs.existsSync(filePath)) return;
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            this.lastHeartbeats = new Map(Object.entries(data.lastHeartbeats || {}));
            this.nodeToService = new Map(Object.entries(data.nodeToService || {}));
            this.activeConnections = new Map(Object.entries(data.activeConnections || {}));
            this.canaryConfigs = new Map(Object.entries(data.canaryConfigs || {}));
            this.blueGreenConfigs = new Map(Object.entries(data.blueGreenConfigs || {}));
            this.roundRobinIndex = new Map(Object.entries(data.roundRobinIndex || {}));
             this.aliases = new Map(Object.entries(data.aliases || {}));
              this.maintenanceNodes = new Set(data.maintenanceNodes || []);
              this.stickyAssignments = new Map(Object.entries(data.stickyAssignments || {}));
              this.kvStore = new Map(Object.entries(data.kvStore || {}));
                if (!config.lightningMode) {
                    this.tagIndex = new Map();
                    for (const [tag, nodes] of Object.entries(data.tagIndex || {})) {
                        this.tagIndex.set(tag, new Set(nodes));
                    }
                    this.versionIndex = new Map();
                    for (const [version, nodes] of Object.entries(data.versionIndex || {})) {
                        this.versionIndex.set(version, new Set(nodes));
                    }
                    this.environmentIndex = new Map();
                    for (const [env, nodes] of Object.entries(data.environmentIndex || {})) {
                        this.environmentIndex.set(env, new Set(nodes));
                    }
                } else {
                    this.tagIndex = new Map();
                    this.versionIndex = new Map();
                    this.environmentIndex = new Map();
                }
            for (const [serviceName, serviceData] of Object.entries(data.services || {})) {
                 const service = {
                     nodes: new Map(Object.entries(serviceData.nodes)),
                     healthyNodes: new Set(),
                     healthyNodesArray: [],
                     availableNodesArray: [],
                     roundRobinIndex: serviceData.roundRobinIndex || 0,
                     minConnectionNode: null,
                     minConnectionCount: 0,
                     minResponseTimeNode: null,
                     minResponseTime: Infinity,
                     connectionSortedNodes: [],
                     responseTimeSortedNodes: []
                 };
                // Rebuild healthyNodes from nodes and lastHeartbeats
                const now = Date.now();
                for (const [nodeName, node] of service.nodes) {
                    const lastBeat = this.lastHeartbeats.get(nodeName);
                    if (lastBeat && now - lastBeat <= this.heartbeatTimeout) {
                        service.healthyNodes.add(node);
                    }
                }
                service.healthyNodesArray = Array.from(service.healthyNodes);
                service.availableNodesArray = service.healthyNodesArray.filter(n => !this.isCircuitOpen(serviceName, n.nodeName) && !this.maintenanceNodes.has(n.nodeName));
                this._updateMinConnectionNode(service);
                this._updateMinResponseTimeNode(service);
                this.services.set(serviceName, service);

                  // Rebuild indexes if not lightning mode
                  if (!config.lightningMode) {
                      // Rebuild tag index
                      for (const node of service.nodes.values()) {
                          if (node.tags && node.tags.length > 0) {
                              for (const tag of node.tags) {
                                  if (!this.tagIndex.has(tag)) {
                                      this.tagIndex.set(tag, new Set());
                                  }
                                  this.tagIndex.get(tag).add(node.nodeName);
                              }
                          }
                          // Rebuild version index
                          if (node.version) {
                              if (!this.versionIndex.has(node.version)) {
                                  this.versionIndex.set(node.version, new Set());
                              }
                              this.versionIndex.get(node.version).add(node.nodeName);
                          }
                          // Rebuild environment index
                          if (node.environment) {
                              if (!this.environmentIndex.has(node.environment)) {
                                  this.environmentIndex.set(node.environment, new Set());
                              }
                              this.environmentIndex.get(node.environment).add(node.nodeName);
                          }
                      }
                  }
            }
        } catch (err) {
            console.error('Failed to load registry from disk:', err);
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
}

module.exports = { LightningServiceRegistry };