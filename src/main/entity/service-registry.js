const config = require('../config/config');
let HashRing;
if (!config.lightningMode) {
    try {
        HashRing = require('hashring');
    } catch (e) {
        // HashRing not available
    }
}
const { constants } = require('../util/constants/constants');
const fs = require('fs');
const path = require('path');
const { consoleLog, consoleError } = require('../util/logging/logging-util');
const EventEmitter = require('events');

// Fast LCG PRNG for ultra-fast mode
let lcgSeed = Date.now();
const lcgA = 1664525;
const lcgC = 1013904223;
const lcgM = 4294967296;

const fastRandom = () => {
    lcgSeed = (lcgA * lcgSeed + lcgC) % lcgM;
    return lcgSeed / lcgM;
};

// Simple hash function for load balancing
const simpleHash = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
};

class ServiceRegistry extends EventEmitter {
    registry = new Map();
    ultraFastHealthyNodes = new Map(); // serviceName -> array of nodes for ultra-fast mode
    ultraFastAvailableNodes = new Map(); // serviceName -> array of available nodes for lightning mode

    constructor() {
        super();
        // Lazy load integrations for better startup performance
        this.isLeader = false;
        this.recentEvents = []; // Store recent events for dashboard

        // Initialize essential Maps for lightning mode - minimal but complete
        if (config.lightningMode) {
            this.registry = new Map(); // serviceName -> { nodes: Map<nodeName, node>, healthyNodes: [], roundRobinIndex: 0 }
            this.lastHeartbeats = new Map(); // nodeName -> timestamp
            this.nodeToService = new Map(); // nodeName -> serviceName for fast cleanup
            this.activeConnections = new Map(); // nodeName -> count for least-connections
            this.timeResetters = new Map(); // Needed for heartbeats in lightning mode
            this.roundRobinIndex = new Map(); // For load balancing
            this.canaryConfigs = new Map(); // Enable canary in lightning mode
            this.blueGreenConfigs = new Map(); // Enable blue-green in lightning mode
            this.acls = new Map(); // serviceName -> { allow: [], deny: [] }
            this.intentions = new Map(); // `${source}:${destination}` -> action
            // Periodic cleanup for lightning mode - optimized interval
            setInterval(() => this.lightningCleanup(), 30000); // every 30s for less frequent cleanup
        } else {
            // Initialize essential Maps
            this.timeResetters = new Map(); // Needed for timeouts even in ultra-fast
            this.serviceUptime = new Map(); // serviceName -> startTime
            this.leases = new Map(); // serviceName:nodeName -> { timeout, leaseTime }
            this.roundRobinIndex = new Map(); // serviceName -> index for round robin

              // Initialize essential Maps for basic functionality even in ultra-fast mode
              this.blacklistNodes = new Map(); // Essential for registration
              this.maintenanceNodes = new Map(); // Essential for health checks
              this.drainingNodes = new Map(); // Essential for health checks
               this.acls = new Map(); // serviceName -> { allow: [], deny: [] }
               this.intentions = new Map(); // `${source}:${destination}` -> action
               this.blacklists = new Set(); // Blacklisted services
               this.serviceVersions = new Map(); // Track service versions for cleanup

            // Initialize Maps only if not fast modes for maximum performance
            if (!config.ultraFastMode && !config.extremeFastMode) {
                this.circuitBreaker = new Map();
                this.hashRegistry = new Map();
                this.healthyNodes = new Map();
                this.healthyCache = new Map();
                this.sortedHealthyCache = new Map();
                this.healthyNodeSets = new Map();
                this.healthyNodesMap = new Map();
                this.availableNodes = new Map();
                this.availableNodesArray = new Map(); // For fast O(1) access to healthy nodes array
                this.activeConnections = new Map();
                this.responseTimes = new Map();
                this.averageResponseTimes = new Map();
                this.healthScore = new Map();
                this.failureRates = new Map();
                this.changes = [];
                this.webhooks = new Map();
                this.tagIndex = new Map();
                this.pendingServices = new Map();
                this.groupIndex = new Map();
                this.kvStore = new Map();
                this.trafficSplit = new Map();
                this.healthHistory = new Map();
                this.serviceTemplates = new Map();
                this.serviceIntentions = new Map();
                this.aclPolicies = new Map();
                this.serviceAliases = new Map();
                this.serviceAliasesReverse = new Map();
                  this.serviceDependencies = new Map();
                  this.apiSpecs = new Map();
            } else {
                    // Fast modes: optimized structures for O(1) operations
                    this.ultraFastHealthyNodes = new Map(); // serviceName -> { nodes: Map<nodeName, node>, array: [] }
                }
        }

        // Defer persistence loading to after startup
        setImmediate(() => {
            if (config.cassandraEnabled) {
                this.initCassandra();
            } else if (config.postgresEnabled) {
                this.initPostgres();
            } else if (config.mysqlEnabled) {
                this.initMySQL();
            } else if (config.mongoEnabled) {
                this.initMongo();
            } else if (config.etcdEnabled) {
                this.initEtcd();
            } else if (config.redisEnabled) {
                this.initRedis();
            } else if (config.persistenceEnabled) {
                this.loadFromFile().catch(err => consoleError('Failed to load from file:', err));
            }

            // Initialize S3 if enabled
            this.initS3();

            // Schedule automated backups
            if (process.env.AUTOMATED_BACKUP_ENABLED === 'true') {
                const backupInterval = parseInt(process.env.BACKUP_INTERVAL_HOURS || '24') * 60 * 60 * 1000;
                setInterval(() => {
                    this.backupToS3().catch(err => consoleError('Automated backup failed:', err));
                }, backupInterval);
                consoleLog(`Automated backups scheduled every ${backupInterval / (60 * 60 * 1000)} hours`);
            }
        });
    }

    register(serviceName, nodeInfo) {
        if (config.lightningMode) {
            // Use lightning mode registration
            const nodeName = `${nodeInfo.host}:${nodeInfo.port}`;
            const weight = nodeInfo.metadata && nodeInfo.metadata.weight ? parseInt(nodeInfo.metadata.weight) : 1;
            const version = nodeInfo.metadata && nodeInfo.metadata.version ? nodeInfo.metadata.version : null;
            const fullServiceName = version ? `${serviceName}:${version}` : serviceName;
            const node = { ...nodeInfo, nodeName, address: `${nodeInfo.host}:${nodeInfo.port}`, weight, connections: 0 };

            if (!this.registry.has(fullServiceName)) {
                this.registry.set(fullServiceName, { nodes: new Map(), healthyNodes: [], roundRobinIndex: 0 });
            }
            const service = this.registry.get(fullServiceName);
            if (service.nodes.has(nodeName)) {
                // Already registered, just update heartbeat
                this.lastHeartbeats.set(nodeName, Date.now());
                return nodeName;
            }
            service.nodes.set(nodeName, node);
            service.healthyNodes.push(node);
            this.nodeToService.set(nodeName, fullServiceName);
            this.lastHeartbeats.set(nodeName, Date.now());
            this.servicesCount++;
            this.nodesCount++;

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
            return nodeName;
        } else {
            // Full mode registration
            const nodeName = `${nodeInfo.host}:${nodeInfo.port}`;
            if (!this.registry.has(serviceName)) {
                this.registry.set(serviceName, { nodes: {}, createdAt: Date.now() });
            }
            const service = this.registry.get(serviceName);
            service.nodes[nodeName] = { ...nodeInfo, nodeName, registeredAt: Date.now() };
            this.addToHealthyNodes(serviceName, nodeName);
            this.publishChange({ type: 'register', serviceName, nodeName, data: { node: service.nodes[nodeName] } });
            this.debounceSave();
            return nodeName;
        }
    }

    ultraFastGetRandomNode(serviceName, strategy = 'round-robin', clientId = null) {
        if (config.lightningMode) {
            // Lightning mode: optimized for speed with basic load balancing
            const service = this.registry.get(serviceName);
            if (!service || !service.healthyNodes || service.healthyNodes.length === 0) return null;
            const nodes = service.healthyNodes;
            if (strategy === 'least-connections') {
                // Least connections: select node with fewest active connections - optimized with early exit
                let minConnections = Infinity;
                let selectedNode = nodes[0];
                for (let i = 0; i < nodes.length; i++) {
                    const node = nodes[i];
                    const connections = this.activeConnections.get(node.nodeName) || 0;
                    if (connections < minConnections) {
                        minConnections = connections;
                        selectedNode = node;
                        if (minConnections === 0) break; // Early exit if we find a node with 0 connections
                    }
                }
                return selectedNode;
            } else if (strategy === 'weighted') {
                return this.getWeightedNode(nodes, serviceName);
            } else if (strategy === 'random') {
                const randomIndex = (fastRandom() * nodes.length) | 0;
                return nodes[randomIndex];
            } else if (strategy === 'hash' && clientId) {
                // Hash-based load balancing for sticky sessions
                const hash = this.simpleHash(clientId);
                const index = hash % nodes.length;
                return nodes[index];
            } else {
                // Round robin for load balancing (default) - optimized
                let index = service.roundRobinIndex || 0;
                const node = nodes[index];
                service.roundRobinIndex = (index + 1) % nodes.length;
                return node;
            }
        } else {
            const serviceData = this.ultraFastHealthyNodes.get(serviceName);
            if (!serviceData || serviceData.array.length === 0) return null;
            // Use cached available nodes to avoid filtering on each call
            const availableNodes = serviceData.available || serviceData.array.filter(node => !this.isInMaintenance(serviceName, node.nodeName) && !this.isInDraining(serviceName, node.nodeName));
            if (availableNodes.length === 0) return null;
            // Use fast LCG random for maximum performance
            const randomIndex = (fastRandom() * availableNodes.length) | 0;
            return availableNodes[randomIndex];
        }
    }

    getWeightedNode(available, serviceName) {
        // Weighted round-robin: select based on weight metadata
        let totalWeight = 0;
        const weights = available.map(node => {
            const weight = node.metadata && node.metadata.weight ? node.metadata.weight : 1;
            totalWeight += weight;
            return weight;
        });
        if (totalWeight === 0) return available[0]; // fallback
        let currentWeight = this.weightedIndex.get(serviceName) || 0;
        currentWeight = (currentWeight + 1) % totalWeight;
        this.weightedIndex.set(serviceName, currentWeight);
        let cumulative = 0;
        for (let i = 0; i < available.length; i++) {
            cumulative += weights[i];
            if (currentWeight < cumulative) {
                return available[i];
            }
        }
        return available[0]; // fallback
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
        // Round-robin for blue-green
        let index = this.roundRobinIndex.get(`${serviceName}-bluegreen`) || 0;
        const nodeName = activeNodes[index % activeNodes.length];
        this.roundRobinIndex.set(`${serviceName}-bluegreen`, index + 1);
        // Find the node in registry
        const service = this.registry.get(serviceName);
        return service && service.nodes.get ? service.nodes.get(nodeName) : service.nodes[nodeName];
    }

    getCanaryNode(serviceName) {
        const config = this.canaryConfigs.get(serviceName);
        if (!config) return null;
        const service = this.registry.get(serviceName);
        if (!service || !service.healthyNodes) return null;
        const canaryNodes = service.healthyNodes.filter(node => config.canaryNodes.includes(node.nodeName));
        if (canaryNodes.length === 0) return null;
        // Simple round-robin for canary
        let index = this.roundRobinIndex.get(`${serviceName}-canary`) || 0;
        const node = canaryNodes[index % canaryNodes.length];
        this.roundRobinIndex.set(`${serviceName}-canary`, index + 1);
        return node;
    }



    updateAvailable(serviceName) {
        if (config.lightningMode && this.ultraFastHealthyNodes.has(serviceName)) {
            const all = this.ultraFastHealthyNodes.get(serviceName);
            const available = all.filter(node => !this.isInMaintenance(serviceName, node.nodeName) && !this.isInDraining(serviceName, node.nodeName));
            this.ultraFastAvailableNodes.set(serviceName, available);
        } else if (config.ultraFastMode && this.ultraFastHealthyNodes.has(serviceName)) {
            // For ultra-fast mode, update the available array in the serviceData
            const serviceData = this.ultraFastHealthyNodes.get(serviceName);
            if (serviceData) {
                serviceData.available = serviceData.array.filter(node => !this.isInMaintenance(serviceName, node.nodeName) && !this.isInDraining(serviceName, node.nodeName));
            }
        }
    }

    async initKafka() {
        if (!config.kafkaEnabled || this.producer) return;
        const Kafka = require('kafkajs').Kafka;
        this.kafka = new Kafka({
            clientId: 'maxine-registry',
            brokers: config.kafkaBrokers
        });
        this.producer = this.kafka.producer();
        await this.producer.connect();
    }

    async initPulsar() {
        if (!config.pulsarEnabled || this.pulsarProducer) return;
        const Pulsar = require('pulsar-client');
        this.pulsarClient = new Pulsar.Client({
            serviceUrl: config.pulsarServiceUrl,
        });
        this.pulsarProducer = this.pulsarClient.createProducer({
            topic: config.pulsarTopic,
        });
    }

    async initNats() {
        if (!config.natsEnabled || this.natsClient) return;
        const { connect } = require('nats');
        this.natsClient = await connect({ servers: config.natsServers });
    }

    async initMqtt() {
        if (!config.mqttEnabled || this.mqttClient) return;
        const mqtt = require('mqtt');
        this.mqttClient = mqtt.connect(config.mqttBroker);
        this.mqttClient.on('connect', () => {
            consoleLog('MQTT connected');
        });
        this.mqttClient.on('error', (err) => {
            consoleError('MQTT error:', err);
        });
    }

    setWss(wss) {
        this.wss = wss;
    }

    async initS3() {
        if (!process.env.S3_BACKUP_ENABLED) return;
        const AWS = require('aws-sdk');
        this.s3 = new AWS.S3({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION || 'us-east-1'
        });
                this.s3Bucket = process.env.S3_BUCKET_NAME;
                consoleLog('S3 backup enabled');
    }

    async backupToS3() {
        if (!this.s3) return;
        try {
            const data = this.backup();
            const key = `maxine-backup-${new Date().toISOString().split('T')[0]}-${Date.now()}.json`;
            await this.s3.putObject({
                Bucket: this.s3Bucket,
                Key: key,
                Body: JSON.stringify(data),
                ContentType: 'application/json'
            }).promise();
            consoleLog(`Backup uploaded to S3: ${key}`);
        } catch (err) {
            consoleError('S3 backup failed:', err);
        }
    }

    async initRedis() {
        if (!config.redisEnabled || this.redisClient) return;
        const redis = require('redis');
        this.redisClient = redis.createClient({
            host: config.redisHost,
            port: config.redisPort,
            password: config.redisPassword
        });
        this.redisClient.on('error', (err) => consoleError('Redis error:', err));
        await this.redisClient.connect();
        this.redisPublisher = this.redisClient.duplicate();
        this.redisSubscriber = this.redisClient.duplicate();
        await this.redisSubscriber.connect();
        this.redisSubscriber.subscribe('maxine-registry-changes', (message) => {
            try {
                const change = JSON.parse(message);
                // Only process changes from other instances (avoid echo)
                if (change.instanceId !== this.instanceId) {
                    this.applyRemoteChange(change);
                }
            } catch (err) {
                consoleError('Error processing remote change:', err);
            }
        });
        // Generate unique instance ID
        this.instanceId = `${require('os').hostname()}-${process.pid}-${Date.now()}`;
        this.loadFromRedis();
        // Start leader election
        setInterval(() => this.electLeader(), 15000); // Every 15 seconds
    }

    async publishChange(change) {
        if (config.redisEnabled) {
            if (!this.redisPublisher) {
                await this.initRedis();
            }
            if (this.redisPublisher) {
                change.instanceId = this.instanceId;
                this.redisPublisher.publish('maxine-registry-changes', JSON.stringify(change)).catch(err => {
                    consoleError('Error publishing change:', err);
                });
            }
        }
    }

    applyRemoteChange(change) {
        const { type, serviceName, nodeName, data } = change;
        switch (type) {
            case 'register':
                if (!this.registry.has(serviceName)) {
                    this.registry.set(serviceName, { nodes: {}, createdAt: Date.now() });
                }
                this.registry.get(serviceName).nodes[nodeName] = data.node;
                this.addToHealthyNodes(serviceName, nodeName);
                break;
            case 'deregister':
                this.removeFromHealthyNodes(serviceName, nodeName);
                const service = this.registry.get(serviceName);
                if (service && service.nodes[nodeName]) {
                    delete service.nodes[nodeName];
                    if (Object.keys(service.nodes).length === 0) {
                        this.registry.delete(serviceName);
                    }
                }
                break;
            case 'healthy':
                if (this.registry.get(serviceName)?.nodes[nodeName]) {
                    this.addToHealthyNodes(serviceName, nodeName);
                }
                break;
            case 'unhealthy':
                this.removeFromHealthyNodes(serviceName, nodeName);
                break;
        }
        // Invalidate caches
        if (this.discoveryService) {
            this.discoveryService.invalidateServiceCache(serviceName);
        }
    }

    async electLeader() {
        if (!config.redisEnabled) return;
        try {
            const leaderKey = `maxine:leader:${config.datacenter}`;
            const result = await this.redisClient.set(leaderKey, this.instanceId, {
                NX: true,
                EX: 30 // 30 seconds TTL
            });
            this.isLeader = result === 'OK';
            if (this.isLeader) {
                consoleLog('Elected as leader');
            }
        } catch (err) {
            consoleError('Leader election error:', err);
        }
    }

    lightningCleanup = () => {
        if (!config.lightningMode) return;
        const now = Date.now();
        const timeoutMs = (config.heartBeatTimeout || 30) * 1000;
        const toRemove = [];
        for (const [nodeName, lastBeat] of this.lastHeartbeats) {
            if (now - lastBeat > timeoutMs) {
                toRemove.push(nodeName);
            }
        }
        // Remove expired nodes - optimized O(1) removal
        for (const nodeName of toRemove) {
            this.lastHeartbeats.delete(nodeName);
            const serviceName = this.nodeToService.get(nodeName);
            if (serviceName) {
                const service = this.registry.get(serviceName);
                if (service) {
                    service.nodes.delete(nodeName);
                    // Remove from healthyNodes array - optimized
                    const healthyNodes = service.healthyNodes;
                    for (let i = healthyNodes.length - 1; i >= 0; i--) {
                        if (healthyNodes[i].nodeName === nodeName) {
                            healthyNodes.splice(i, 1);
                            break;
                        }
                    }
                    if (service.nodes.size === 0) {
                        this.registry.delete(serviceName);
                    }
                }
                this.nodeToService.delete(nodeName);
            }
        }
    };

    getRegServers = () => Object.fromEntries(this.registry);

    getRecentEvents = (limit = 10) => this.recentEvents.slice(-limit);

    getDashboardStats = () => {
        const services = this.getRegServers();
        const serviceCount = Object.keys(services).length;
        let totalNodes = 0;
        let healthyNodes = 0;
        let unhealthyNodes = 0;
        for (const serviceName in services) {
            const nodes = services[serviceName].nodes;
            totalNodes += Object.keys(nodes).length;
            for (const nodeName in nodes) {
                if (nodes[nodeName].healthy) healthyNodes++;
                else unhealthyNodes++;
            }
        }
        const cacheStats = this.discoveryService ? {
            cacheHits: this.discoveryService.cacheHits || 0,
            cacheMisses: this.discoveryService.cacheMisses || 0,
            cacheSize: this.discoveryService.cache.size || 0
        } : { cacheHits: 0, cacheMisses: 0, cacheSize: 0 };

        return {
            serviceCount,
            totalNodes,
            healthyNodes,
            unhealthyNodes,
            cacheHits: cacheStats.cacheHits,
            cacheMisses: cacheStats.cacheMisses,
            services
        };
    };

    getServiceUptime = (serviceName) => {
        const startTime = this.serviceUptime.get(serviceName);
        return startTime ? Date.now() - startTime : null;
    };

    // Service version management
    registerServiceVersion = (serviceName, version) => {
        if (!this.serviceVersions.has(serviceName)) {
            this.serviceVersions.set(serviceName, new Set());
        }
        this.serviceVersions.get(serviceName).add(version);
        // Keep only latest 5 versions
        const versions = Array.from(this.serviceVersions.get(serviceName)).sort().reverse();
        if (versions.length > 5) {
            const toRemove = versions.slice(5);
            toRemove.forEach(v => {
                this.serviceVersions.get(serviceName).delete(v);
                // Deregister old version services
                const fullServiceName = `${serviceName}:${v}`;
                if (this.registry.has(fullServiceName)) {
                    this.registry.delete(fullServiceName);
                    consoleLog(`Cleaned up old version ${fullServiceName}`);
                }
            });
        }
    };

    // Service aliases support
    serviceAliases = new Map(); // alias -> primaryServiceName
    serviceAliasesReverse = new Map(); // primaryServiceName -> Set of aliases
    serviceDependencies = new Map(); // serviceName -> Set of dependent services

    addChange = (type, serviceName, nodeName, data) => {
        if (config.extremeFastMode || config.ultraFastMode || config.lightningMode) return; // Disable changes and notifications in fast modes
        const change = {
            type,
            serviceName,
            nodeName,
            data,
            timestamp: Date.now()
        };
        this.changes.push(change);
        // Keep only last 1000 changes
        if (this.changes.length > 1000) {
            this.changes.shift();
        }
        // Publish to Redis for distributed registry
        this.publishChange(change);
        // Skip notifications in high performance mode
        if (config.highPerformanceMode) return;
        // Notify webhooks asynchronously
        this.notifyWebhooks(serviceName, change);
        // Send to Kafka
        if (config.kafkaEnabled) {
            if (!this.producer) {
                this.initKafka();
            }
            if (this.producer) {
                this.producer.send({
                    topic: 'maxine-registry-events',
                    messages: [{ value: JSON.stringify(change) }]
                }).catch(err => consoleError('Kafka send error:', err));
            }
        }
        // Send to Pulsar
        if (config.pulsarEnabled) {
            if (!this.pulsarProducer) {
                this.initPulsar();
            }
            if (this.pulsarProducer) {
                this.pulsarProducer.then(producer => {
                    producer.send({
                        data: Buffer.from(JSON.stringify(change))
                    }).catch(err => consoleError('Pulsar send error:', err));
                }).catch(err => consoleError('Pulsar producer error:', err));
            }
        }
        // Send to NATS
        if (config.natsEnabled) {
            if (!this.natsClient) {
                this.initNats();
            }
            if (this.natsClient) {
                this.natsClient.publish(config.natsSubject, JSON.stringify(change)).catch(err => consoleError('NATS send error:', err));
            }
        }
        // Send to MQTT
        if (config.mqttEnabled) {
            if (!this.mqttClient) {
                this.initMqtt();
            }
            if (this.mqttClient) {
                this.mqttClient.publish(config.mqttTopic, JSON.stringify(change), { qos: 1 }, (err) => {
                    if (err) consoleError('MQTT send error:', err);
                });
            }
        }
        // Emit event for listeners
        this.emit('change', change);
    }

    notifyWebhooks = (serviceName, change) => {
        const urls = this.getWebhooks(serviceName);
        urls.forEach(url => {
            // Send POST request to webhook
            const axios = require('axios');
            axios.post(url, change, { timeout: 5000 }).catch(err => {
                consoleError('Webhook notification failed:', url, err.message);
            });
        });
    }

    addToTagIndex = (nodeName, tags) => {
        if (!tags || !Array.isArray(tags)) return;
        for (const tag of tags) {
            if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
            this.tagIndex.get(tag).add(nodeName);
        }
    }

    removeFromTagIndex = (nodeName, tags) => {
        if (!tags || !Array.isArray(tags)) return;
        for (const tag of tags) {
            const set = this.tagIndex.get(tag);
            if (set) {
                set.delete(nodeName);
                if (set.size === 0) this.tagIndex.delete(tag);
            }
        }
    }

    getChangesSince = (since) => {
        return this.changes.filter(change => change.timestamp > since);
    }

    addWebhook = (serviceName, url) => {
        if (!this.webhooks.has(serviceName)) {
            this.webhooks.set(serviceName, new Set());
        }
        this.webhooks.get(serviceName).add(url);
    }

    removeWebhook = (serviceName, url) => {
        if (this.webhooks.has(serviceName)) {
            this.webhooks.get(serviceName).delete(url);
        }
    }

    getWebhooks = (serviceName) => {
        return this.webhooks.has(serviceName) ? Array.from(this.webhooks.get(serviceName)) : [];
    }

    // Alias management
    addServiceAlias = (alias, primaryServiceName) => {
        this.serviceAliases.set(alias, primaryServiceName);
        if (!this.serviceAliasesReverse.has(primaryServiceName)) {
            this.serviceAliasesReverse.set(primaryServiceName, new Set());
        }
        this.serviceAliasesReverse.get(primaryServiceName).add(alias);
        this.debounceSave();
    }

    removeServiceAlias = (alias) => {
        const primary = this.serviceAliases.get(alias);
        if (primary && this.serviceAliasesReverse.has(primary)) {
            this.serviceAliasesReverse.get(primary).delete(alias);
            if (this.serviceAliasesReverse.get(primary).size === 0) {
                this.serviceAliasesReverse.delete(primary);
            }
        }
        this.serviceAliases.delete(alias);
        this.debounceSave();
    }

    getServiceByAlias = (alias) => {
        return this.serviceAliases.get(alias) || alias; // Return primary name or the alias itself if not found
    }

    getAliasesForService = (serviceName) => {
        return this.serviceAliasesReverse.has(serviceName) ? Array.from(this.serviceAliasesReverse.get(serviceName)) : [];
    }

    // Service instance blacklisting
    addToBlacklist = (serviceName, nodeName) => {
        if (!this.blacklistNodes.has(serviceName)) {
            this.blacklistNodes.set(serviceName, new Set());
        }
        this.blacklistNodes.get(serviceName).add(nodeName);
        this.removeFromHealthyNodes(serviceName, nodeName);
        this.debounceSave();
    }

    removeFromBlacklist = (serviceName, nodeName) => {
        if (this.blacklistNodes.has(serviceName)) {
            this.blacklistNodes.get(serviceName).delete(nodeName);
            // Re-add to healthy if healthy
            const service = this.registry.get(serviceName);
            if (service && service.nodes[nodeName] && service.nodes[nodeName].healthy) {
                this.addToHealthyNodes(serviceName, nodeName);
            }
            this.debounceSave();
        }
    }

    isBlacklisted = (serviceName, nodeName) => {
        return this.blacklistNodes.get(serviceName)?.has(nodeName) || false;
    }

    getBlacklistedNodes = (serviceName) => {
        return this.blacklistNodes.get(serviceName) ? Array.from(this.blacklistNodes.get(serviceName)) : [];
    }

    // Service intentions for traffic control
    setServiceIntention = (source, destination, action) => {
        if (!this.serviceIntentions.has(source)) {
            this.serviceIntentions.set(source, new Map());
        }
        this.serviceIntentions.get(source).set(destination, action);
        this.debounceSave();
    }

    getServiceIntention = (source, destination) => {
        return this.serviceIntentions.get(source)?.get(destination) || 'allow';
    }

    // ACL methods
    setACL = (serviceName, acl) => {
        this.acls.set(serviceName, acl);
        this.debounceSave();
    }

    getACL = (serviceName) => {
        return this.acls.get(serviceName) || { allow: [], deny: [] };
    }

    // Intention methods (alternative implementation)
    setIntention = (source, destination, action) => {
        const key = `${source}:${destination}`;
        this.intentions.set(key, action);
        this.debounceSave();
    }

    getIntention = (source, destination) => {
        const key = `${source}:${destination}`;
        return this.intentions.get(key) || 'allow';
    }

    // Service dependency management
    addServiceDependency = (serviceName, dependentService) => {
        if (!this.serviceDependencies.has(serviceName)) {
            this.serviceDependencies.set(serviceName, new Set());
        }
        this.serviceDependencies.get(serviceName).add(dependentService);
        this.debounceSave();
    }

    removeServiceDependency = (serviceName, dependentService) => {
        if (this.serviceDependencies.has(serviceName)) {
            this.serviceDependencies.get(serviceName).delete(dependentService);
            this.debounceSave();
        }
    }

    getServiceDependencies = (serviceName) => {
        return this.serviceDependencies.has(serviceName) ? Array.from(this.serviceDependencies.get(serviceName)) : [];
    }

    getDependentServices = (serviceName) => {
        const dependents = [];
        for (const [svc, deps] of this.serviceDependencies) {
            if (deps.has(serviceName)) {
                dependents.push(svc);
            }
        }
        return dependents;
    }

    addHealthHistory = (serviceName, nodeName, status) => {
        if (!this.healthHistory.has(serviceName)) {
            this.healthHistory.set(serviceName, new Map());
        }
        const serviceHistory = this.healthHistory.get(serviceName);
        if (!serviceHistory.has(nodeName)) {
            serviceHistory.set(nodeName, []);
        }
        const history = serviceHistory.get(nodeName);
        history.push({ timestamp: Date.now(), status });
        // Keep last 100 entries
        if (history.length > 100) {
            history.shift();
        }
    }

    getHealthHistory = (serviceName, nodeName) => {
        if (!this.healthHistory.has(serviceName)) return [];
        const serviceHistory = this.healthHistory.get(serviceName);
        return serviceHistory.get(nodeName) || [];
    }

    // Key-Value store
    setKv = (key, value) => {
        this.kvStore.set(key, value);
        this.debounceSave();
    }

    getKv = (key) => {
        return this.kvStore.get(key);
    }

    deleteKv = (key) => {
        const deleted = this.kvStore.delete(key);
        if (deleted) this.debounceSave();
        return deleted;
    }

    getAllKv = () => {
        return Object.fromEntries(this.kvStore);
    }

    // Service Templates
    addServiceTemplate = (name, template) => {
        this.serviceTemplates.set(name, template);
        this.debounceSave();
    }

    getServiceTemplate = (name) => {
        return this.serviceTemplates.get(name);
    }

    deleteServiceTemplate = (name) => {
        const deleted = this.serviceTemplates.delete(name);
        if (deleted) this.debounceSave();
        return deleted;
    }

     listServiceTemplates = () => {
         return Object.fromEntries(this.serviceTemplates);
     }

     // ACL Policies
     addAclPolicy = (name, policy) => {
         this.aclPolicies.set(name, policy);
         this.debounceSave();
     }

     getAclPolicy = (name) => {
         return this.aclPolicies.get(name);
     }

     deleteAclPolicy = (name) => {
         const deleted = this.aclPolicies.delete(name);
         if (deleted) this.debounceSave();
         return deleted;
     }

     listAclPolicies = () => {
         return Object.fromEntries(this.aclPolicies);
     }

    // Backup and restore
    backup = () => {
        return {
            registry: Object.fromEntries(this.registry),
            hashRegistry: Array.from(this.hashRegistry.keys()),
            serviceAliases: Object.fromEntries(this.serviceAliases),
            serviceAliasesReverse: Object.fromEntries(
                Array.from(this.serviceAliasesReverse.entries()).map(([k, v]) => [k, Array.from(v)])
            ),
            serviceDependencies: Object.fromEntries(
                Array.from(this.serviceDependencies.entries()).map(([k, v]) => [k, Array.from(v)])
            ),
                 kvStore: Object.fromEntries(this.kvStore),
                 trafficSplit: Object.fromEntries(this.trafficSplit),
                 healthHistory: Object.fromEntries(
                     Array.from(this.healthHistory.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
                 ),
                  serviceTemplates: Object.fromEntries(this.serviceTemplates),
             maintenanceNodes: Object.fromEntries(
                 Array.from(this.maintenanceNodes.entries()).map(([k, v]) => [k, Array.from(v)])
             ),
             drainingNodes: Object.fromEntries(
                 Array.from(this.drainingNodes.entries()).map(([k, v]) => [k, Array.from(v)])
             ),
             webhooks: Object.fromEntries(
                 Array.from(this.webhooks.entries()).map(([k, v]) => [k, Array.from(v)])
             ),
                 tagIndex: Object.fromEntries(
                     Array.from(this.tagIndex.entries()).map(([k, v]) => [k, Array.from(v)])
                 ),
                   groupIndex: Object.fromEntries(
                       Array.from(this.groupIndex.entries()).map(([k, v]) => [k, Object.fromEntries(
                           Array.from(v.entries()).map(([k2, v2]) => [k2, Object.fromEntries(v2)])
                       )])
                   ),
               circuitBreaker: Object.fromEntries(this.circuitBreaker),
               availableNodes: Object.fromEntries(
                   Array.from(this.availableNodes.entries()).map(([k, v]) => [k, Array.from(v)])
               ),
                  ultraFastHealthyNodes: Object.fromEntries(
                        Array.from(this.ultraFastHealthyNodes.entries()).map(([k, v]) => [k, config.lightningMode ? v : v.array])
                    ),
                  lightningNodes: config.lightningMode ? Object.fromEntries(
                        Array.from(this.registry.entries()).map(([k, v]) => [k, { ...v, nodes: Array.from(v.nodes.entries()) }])
                    ) : {},
                  serviceIntentions: Object.fromEntries(
                      Array.from(this.serviceIntentions.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
                  ),
                  aclPolicies: Object.fromEntries(this.aclPolicies),
                  blacklists: Array.from(this.blacklists),
                  blacklistNodes: Object.fromEntries(
                      Array.from(this.blacklistNodes.entries()).map(([k, v]) => [k, Array.from(v)])
                  )
          };
    }

    restore = (data) => {
        this.registry = new Map(Object.entries(data.registry || {}));
        this.serviceAliases = new Map(Object.entries(data.serviceAliases || {}));
        this.serviceAliasesReverse = new Map(
            Object.entries(data.serviceAliasesReverse || {}).map(([k, v]) => [k, new Set(v)])
        );
        this.serviceDependencies = new Map(
            Object.entries(data.serviceDependencies || {}).map(([k, v]) => [k, new Set(v)])
        );
                 this.kvStore = new Map(Object.entries(data.kvStore || {}));
                 this.trafficSplit = new Map(Object.entries(data.trafficSplit || {}));
                 this.healthHistory = new Map(
                     Object.entries(data.healthHistory || {}).map(([k, v]) => [k, new Map(Object.entries(v))])
                 );
                  this.serviceTemplates = new Map(Object.entries(data.serviceTemplates || {}));
         this.maintenanceNodes = new Map(
             Object.entries(data.maintenanceNodes || {}).map(([k, v]) => [k, new Set(v)])
         );
         this.drainingNodes = new Map(
             Object.entries(data.drainingNodes || {}).map(([k, v]) => [k, new Set(v)])
         );
        this.webhooks = new Map(
            Object.entries(data.webhooks || {}).map(([k, v]) => [k, new Set(v)])
        );
          this.tagIndex = new Map(
              Object.entries(data.tagIndex || {}).map(([k, v]) => [k, new Set(v)])
          );
           this.groupIndex = new Map(
               Object.entries(data.groupIndex || {}).map(([k, v]) => [k, new Map(
                   Object.entries(v).map(([k2, v2]) => [k2, new Map(Object.entries(v2))])
               )])
           );
          this.circuitBreaker = new Map(Object.entries(data.circuitBreaker || {}));
            this.availableNodes = new Map(
                Object.entries(data.availableNodes || {}).map(([k, v]) => [k, new Map(Object.entries(v))])
            );
                          if (config.lightningMode) {
                              this.ultraFastHealthyNodes = new Map(
                                  Object.entries(data.ultraFastHealthyNodes || {}).map(([k, v]) => [k, v])
                              );
                              // Restore lightning registry
                              this.registry = new Map(
                                  Object.entries(data.lightningNodes || {}).map(([k, v]) => [k, { ...v, nodes: new Map(v.nodes) }])
                              );
                          } else {
                             this.ultraFastHealthyNodes = new Map(
                                 Object.entries(data.ultraFastHealthyNodes || {}).map(([k, v]) => [
                                     k,
                                     { nodes: new Map(v.map(n => [n.nodeName, n])), array: v }
                                 ])
                             );
                         }
            this.serviceIntentions = new Map(
                Object.entries(data.serviceIntentions || {}).map(([k, v]) => [k, new Map(Object.entries(v))])
            );
             this.aclPolicies = new Map(Object.entries(data.aclPolicies || {}));
             this.blacklists = new Set(data.blacklists || []);
             this.blacklistNodes = new Map(
                 Object.entries(data.blacklistNodes || {}).map(([k, v]) => [k, new Set(v)])
             );
                    // Reinitialize hashRegistry and healthyNodes
                    this.hashRegistry = new Map();
                    this.healthyNodes = new Map();
                    this.healthyCache = new Map();
                    this.sortedHealthyCache = new Map();
                  this.healthyNodeSets = new Map();
         for (const serviceName of data.hashRegistry || []) {
             this.initHashRegistry(serviceName);
             const nodes = this.getNodes(serviceName);
             for (const nodeName of Object.keys(nodes || {})) {
                 this.addNodeToHashRegistry(serviceName, nodeName);
                 if (nodes[nodeName].healthy !== false) {
                     this.addToHealthyNodes(serviceName, nodeName);
                 }
                 this.addToTagIndex(nodeName, nodes[nodeName].metadata.tags);
             }
         }
        this.debounceSave();
    }

    setTrafficSplit = (baseServiceName, split) => {
        this.trafficSplit.set(baseServiceName, split);
        this.debounceSave();
    }

    getTrafficSplit = (baseServiceName) => {
        return this.trafficSplit.get(baseServiceName);
    }

    // Maintenance mode management
    setMaintenanceMode = (serviceName, nodeName, inMaintenance) => {
        const service = this.registry.get(serviceName);
        const node = service && service.nodes[nodeName] ? service.nodes[nodeName] : null;
        if (inMaintenance) {
            if (!this.maintenanceNodes.has(serviceName)) {
                this.maintenanceNodes.set(serviceName, new Set());
            }
            this.maintenanceNodes.get(serviceName).add(nodeName);
            // Remove from available
            if (this.availableNodes.has(serviceName)) {
                this.availableNodes.get(serviceName).delete(nodeName);
            }
            // Remove from group index
            if (this.groupIndex.has(serviceName) && node && node.metadata.group) {
                const groupMap = this.groupIndex.get(serviceName);
                if (groupMap.has(node.metadata.group)) {
                    groupMap.get(node.metadata.group).delete(nodeName);
                    if (groupMap.get(node.metadata.group).size === 0) groupMap.delete(node.metadata.group);
                }
                if (groupMap.size === 0) this.groupIndex.delete(serviceName);
            }
        } else {
            if (this.maintenanceNodes.has(serviceName)) {
                this.maintenanceNodes.get(serviceName).delete(nodeName);
                if (this.maintenanceNodes.get(serviceName).size === 0) {
                    this.maintenanceNodes.delete(serviceName);
                }
                  // Add to available if healthy and not draining
                  if (this.healthyNodeSets.has(serviceName) && this.healthyNodeSets.get(serviceName).has(nodeName) && !this.isInDraining(serviceName, nodeName)) {
                      if (!this.availableNodes.has(serviceName)) {
                          this.availableNodes.set(serviceName, new Set());
                      }
                      this.availableNodes.get(serviceName).add(nodeName);
                      // Add to group index
                      if (node && node.metadata.group) {
                          if (!this.groupIndex.has(serviceName)) this.groupIndex.set(serviceName, new Map());
                          const groupMap = this.groupIndex.get(serviceName);
                          if (!groupMap.has(node.metadata.group)) groupMap.set(node.metadata.group, new Set());
                          groupMap.get(node.metadata.group).add(nodeName);
                      }
                  }
             }
         }
          this.invalidateServiceCaches(serviceName);
          this.updateAvailable(serviceName);
          this.debounceSave();
    }

    isInMaintenance = (serviceName, nodeName) => {
        return this.maintenanceNodes.has(serviceName) && this.maintenanceNodes.get(serviceName).has(nodeName);
    }

    setDrainingMode = (serviceName, nodeName, draining) => {
        const service = this.registry.get(serviceName);
        const node = service && service.nodes[nodeName] ? service.nodes[nodeName] : null;
        if (draining) {
            if (!this.drainingNodes.has(serviceName)) {
                this.drainingNodes.set(serviceName, new Set());
            }
            this.drainingNodes.get(serviceName).add(nodeName);
            // Remove from available
            if (this.availableNodes.has(serviceName)) {
                this.availableNodes.get(serviceName).delete(nodeName);
            }
            // Remove from group index
            if (this.groupIndex.has(serviceName) && node && node.metadata.group) {
                const groupMap = this.groupIndex.get(serviceName);
                if (groupMap.has(node.metadata.group)) {
                    groupMap.get(node.metadata.group).delete(nodeName);
                    if (groupMap.get(node.metadata.group).size === 0) groupMap.delete(node.metadata.group);
                }
                if (groupMap.size === 0) this.groupIndex.delete(serviceName);
            }
        } else {
            if (this.drainingNodes.has(serviceName)) {
                this.drainingNodes.get(serviceName).delete(nodeName);
                if (this.drainingNodes.get(serviceName).size === 0) {
                    this.drainingNodes.delete(serviceName);
                }
                   // Add to available if healthy and not maintenance
                   if (this.healthyNodeSets.has(serviceName) && this.healthyNodeSets.get(serviceName).has(nodeName) && !this.isInMaintenance(serviceName, nodeName)) {
                       if (!this.availableNodes.has(serviceName)) {
                           this.availableNodes.set(serviceName, new Map());
                       }
                       this.availableNodes.get(serviceName).set(nodeName, node);
                       // Add to group index
                       if (node && node.metadata && node.metadata.group) {
                           if (!this.groupIndex.has(serviceName)) this.groupIndex.set(serviceName, new Map());
                           const groupMap = this.groupIndex.get(serviceName);
                           if (!groupMap.has(node.metadata.group)) groupMap.set(node.metadata.group, new Map());
                           groupMap.get(node.metadata.group).set(nodeName, node);
                       }
                   }
            }
         }
          // Invalidate cache
          for (const key of this.healthyCache.keys()) {
              if (key === serviceName || key.startsWith(serviceName + ':')) {
                  this.healthyCache.delete(key);
                  this.sortedHealthyCache.delete(key);
              }
          }
          this.updateAvailable(serviceName);
          this.debounceSave();
    }

    isInDraining = (serviceName, nodeName) => {
        return this.drainingNodes.has(serviceName) && this.drainingNodes.get(serviceName).has(nodeName);
    }

    setLease = (serviceName, nodeName, leaseTime) => {
        const key = `${serviceName}:${nodeName}`;
        const existing = this.leases.get(key);
        if (existing) {
            clearTimeout(existing.timeout);
        }
        const timeout = setTimeout(() => {
            consoleLog(`Lease expired for ${serviceName}:${nodeName}, deregistering`);
            this.removeNodeFromRegistry(serviceName, nodeName);
            this.leases.delete(key);
        }, leaseTime * 1000);
        this.leases.set(key, { timeout, leaseTime });
    }

    renewLease = (serviceName, nodeName) => {
        const key = `${serviceName}:${nodeName}`;
        const lease = this.leases.get(key);
        if (lease) {
            clearTimeout(lease.timeout);
            const timeout = setTimeout(() => {
                consoleLog(`Lease expired for ${serviceName}:${nodeName}, deregistering`);
                this.removeNodeFromRegistry(serviceName, nodeName);
                this.leases.delete(key);
            }, lease.leaseTime * 1000);
            lease.timeout = timeout;
        }
    }

    getNodes = (serviceName) => {

        const service = this.registry.get(serviceName);

        if (config.lightningMode) {
            return service ? service.nodes : new Map();
        } else {
            return service ? service.nodes : {};
        }

    };

    getHealthyNodes = (serviceName, group, tags, deployment, filter) => {
        // Check if service is blacklisted
        if (this.blacklists.has(serviceName)) return [];

        // Ultra-fast mode: return array from Map without any filtering
        if (config.ultraFastMode) {
            return this.ultraFastHealthyNodes.get(serviceName)?.array || [];
        }

        // Fast path: no filters, return pre-computed array
        if (!group && (!tags || tags.length === 0) && !deployment && !filter) {
            return this.availableNodesArray.get(serviceName) || [];
        }

        const groupKey = group ? `:${group}` : '';
        const tagKey = tags && tags.length > 0 ? `:${tags.sort().join(',')}` : '';
        const deploymentKey = deployment ? `:${deployment}` : '';
        const filterKey = filter ? `:${JSON.stringify(filter)}` : '';
        const cacheKey = `${serviceName}${groupKey}${tagKey}${deploymentKey}${filterKey}`;
        if (!this.sortedHealthyCache.has(cacheKey)) {
            let candidates;
            if (group) {
                candidates = this.groupIndex.get(serviceName)?.get(group) || new Map();
            } else {
                candidates = this.availableNodes.get(serviceName) || new Map();
            }
            let filtered = [];
            if (tags && tags.length > 0) {
                // Optimize tag filtering using tagIndex intersection
                let intersection = new Set();
                let first = true;
                for (const tag of tags) {
                    const set = this.tagIndex.get(tag);
                    if (!set) {
                        intersection.clear();
                        break;
                    }
                    if (first) {
                        intersection = new Set(set);
                        first = false;
                    } else {
                        for (const x of intersection) {
                            if (!set.has(x)) {
                                intersection.delete(x);
                            }
                        }
                    }
                }
                for (const nodeName of intersection) {
                    const node = candidates.get(nodeName);
                    if (node && (!deployment || node.metadata.deployment === deployment) && !this.isBlacklisted(serviceName, nodeName)) {
                        filtered.push(node);
                    }
                }
            } else if (deployment) {
                for (const [nodeName, node] of candidates) {
                    if (node.metadata.deployment !== deployment || this.isBlacklisted(serviceName, nodeName)) continue;
                    filtered.push(node);
                }
            } else {
                filtered = Array.from(candidates.values()).filter(node => !this.isBlacklisted(serviceName, node.nodeName));
            }
            if (filter) {
                filtered = filtered.filter(node => {
                    for (const [key, value] of Object.entries(filter)) {
                        if (node.metadata[key] !== value) return false;
                    }
                    return true;
                });
            }
            // Filter out nodes with open circuit breakers
            if (config.circuitBreakerEnabled) {
                filtered = filtered.filter(node => !this.isCircuitOpen(serviceName, node.nodeName));
            }
            // Only sort if not already sorted by priority
            if (filtered.length > 1 && (filtered[0].metadata.priority || 0) !== (filtered[filtered.length - 1].metadata.priority || 0)) {
                filtered.sort((a, b) => (b.metadata.priority || 0) - (a.metadata.priority || 0));
            }
            this.sortedHealthyCache.set(cacheKey, filtered);
        }
        return this.sortedHealthyCache.get(cacheKey);
    }

    getHealthyNodesUltraFast = (serviceName) => {
           // Ultra fast: return healthy nodes array
           const serviceData = this.ultraFastHealthyNodes.get(serviceName);
           return serviceData ? serviceData.array : [];
       }









        calculateHealthScore = (serviceName, nodeName) => {
            const node = this.registry.get(serviceName)?.nodes[nodeName];
            if (!node) return 0;

            const failureRate = this.failureRates.get(`${serviceName}:${nodeName}`) || 0;
            const avgResponseTime = this.averageResponseTimes.get(`${serviceName}:${nodeName}`) || 0;

            // Health score: higher is better (0-100)
            // Penalize high failure rates and slow response times
            const failurePenalty = failureRate * 50; // 0-50 points penalty
            const latencyPenalty = Math.min(avgResponseTime / 100, 50); // 0-50 points penalty for latency > 100ms

            return Math.max(0, 100 - failurePenalty - latencyPenalty);
        }



    initHashRegistry = (serviceName) => {
        if(!this.hashRegistry.has(serviceName) && HashRing){
            this.hashRegistry.set(serviceName, new HashRing());
        }
    }

    addToHealthyNodes = (serviceName, nodeName) => {
        const service = this.registry.get(serviceName);
        if (!service || !service.nodes[nodeName] || this.isBlacklisted(serviceName, nodeName)) return;

        // Enforce instance limits
        if (config.maxInstancesPerService > 0 && service.nodes && Object.keys(service.nodes).length >= config.maxInstancesPerService) {
            consoleLog(`Service ${serviceName} has reached maximum instances limit (${config.maxInstancesPerService})`);
            return;
        }

        const node = service.nodes[nodeName];

        if (config.ultraFastMode || config.lightningMode) {
            if (config.lightningMode) {
                // Lightning mode: maintain healthyNodes array - optimized
                let serviceData = this.registry.get(serviceName);
                if (!serviceData) {
                    serviceData = { nodes: new Map(), healthyNodes: [], roundRobinIndex: 0 };
                    this.registry.set(serviceName, serviceData);
                }
                // Add to nodes if not exists
                if (!serviceData.nodes.has(nodeName)) {
                    serviceData.nodes.set(nodeName, node);
                    this.nodeToService.set(nodeName, serviceName); // Track for fast cleanup
                }
                // Add to healthyNodes if not already - optimized lookup
                let exists = false;
                for (let i = 0; i < serviceData.healthyNodes.length; i++) {
                    if (serviceData.healthyNodes[i].nodeName === nodeName) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    serviceData.healthyNodes.push(node);
                }
            } else {
                // Ultra-fast mode: Map and array
                let serviceData = this.ultraFastHealthyNodes.get(serviceName);
                if (!serviceData) {
                    serviceData = { nodes: new Map(), array: [] };
                    this.ultraFastHealthyNodes.set(serviceName, serviceData);
                }
                if (!serviceData.nodes.has(nodeName)) {
                    serviceData.nodes.set(nodeName, node);
                    serviceData.array.push(node);
                    // Update available nodes
                    serviceData.available = serviceData.array.filter(n => !this.isInMaintenance(serviceName, n.nodeName) && !this.isInDraining(serviceName, n.nodeName));
                }
            }
            // Skip all notifications and changes in fast modes
            return;
        }

        // Optimization: Pre-sort healthy nodes by priority for faster access in high performance mode
        if (config.highPerformanceMode && node.metadata && node.metadata.priority !== undefined) {
            // Will be sorted when retrieved
        }

        if (!this.healthyNodes.has(serviceName)) {
            this.healthyNodes.set(serviceName, []);
            this.healthyNodeSets.set(serviceName, new Set());
            this.healthyNodesMap.set(serviceName, new Map());
            this.availableNodes.set(serviceName, new Map());
            this.availableNodesArray.set(serviceName, []);
        }
        let arr = this.healthyNodes.get(serviceName);
        let set = this.healthyNodeSets.get(serviceName);
        let map = this.healthyNodesMap.get(serviceName);
        let avail = this.availableNodes.get(serviceName);
        if (!set.has(nodeName)) {
            set.add(nodeName);
            map.set(nodeName, node);
            arr.push(node);
            this.addToHashRegistry(serviceName, nodeName);
            // Add to available if not in maintenance or draining
            if (!this.isInMaintenance(serviceName, nodeName) && !this.isInDraining(serviceName, nodeName)) {
                avail.set(nodeName, node);
                this.availableNodesArray.get(serviceName).push(node);
                // Add to group index
                if (node.metadata && node.metadata.group) {
                    if (!this.groupIndex.has(serviceName)) this.groupIndex.set(serviceName, new Map());
                    const groupMap = this.groupIndex.get(serviceName);
                    if (!groupMap.has(node.metadata.group)) groupMap.set(node.metadata.group, new Map());
                    groupMap.get(node.metadata.group).set(nodeName, node);
                }
            }
            // Invalidate caches only for this service
            this.invalidateServiceCaches(serviceName);
            this.addChange('healthy', serviceName, nodeName, { healthy: true });
        }
    }

    register = (serviceName, nodeInfo, namespace = "default", datacenter = "default") => {
        const { host, port, metadata = {}, tags = [], version, environment } = nodeInfo;
        const nodeId = `${serviceName}:${host}:${port}`;
        const address = `${host}:${port}`;
        const node = {
            nodeName: nodeId,
            address,
            host,
            port,
            metadata: { ...metadata, ...(tags ? { tags } : {}), ...(version ? { version } : {}), ...(environment ? { environment } : {}) },
            healthy: true,
            registeredAt: Date.now()
        };

        if (config.lightningMode) {
            // Lightning mode: optimized for speed
            let serviceData = this.registry.get(serviceName);
            if (!serviceData) {
                serviceData = { nodes: new Map(), healthyNodes: [], roundRobinIndex: 0 };
                this.registry.set(serviceName, serviceData);
            }
            // Add to nodes if not exists
            if (!serviceData.nodes.has(nodeId)) {
                serviceData.nodes.set(nodeId, node);
                this.nodeToService.set(nodeId, serviceName); // Track for fast cleanup
                this.lastHeartbeats.set(nodeId, Date.now()); // Initialize heartbeat
            }
            // Add to healthyNodes if not already - optimized lookup
            let exists = false;
            for (let i = 0; i < serviceData.healthyNodes.length; i++) {
                if (serviceData.healthyNodes[i].nodeName === nodeId) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                serviceData.healthyNodes.push(node);
            }
        } else {
            // Full mode: comprehensive registration
            if (!this.registry.has(serviceName)) {
                this.registry.set(serviceName, { nodes: {} });
            }
            const service = this.registry.get(serviceName);
            if (!service.nodes[nodeId]) {
                service.nodes[nodeId] = node;
                this.addToHealthyNodes(serviceName, nodeId);
                // Initialize heartbeat tracking
                this.lastHeartbeats.set(nodeId, Date.now());
                // Broadcast registration event
                global.broadcast('service_registered', { serviceName, nodeId });
            }
        }
        return nodeId;
    }

    invalidateServiceCaches = (serviceName) => {
        // Invalidate all cache entries for this service (including groups)
        for (const key of this.healthyCache.keys()) {
            if (key === serviceName || key.startsWith(serviceName + ':')) {
                this.healthyCache.delete(key);
                this.sortedHealthyCache.delete(key);
            }
        }
           // Ultra-fast cache is maintained separately
    }

    removeFromHealthyNodes = (serviceName, nodeName) => {
        if (config.ultraFastMode || config.lightningMode) {
            if (config.lightningMode) {
                // Lightning mode: remove from healthyNodes array
                const service = this.registry.get(serviceName);
                if (service) {
                    service.healthyNodes = service.healthyNodes.filter(n => n.nodeName !== nodeName);
                    // Also remove from nodes Map
                    service.nodes.delete(nodeName);
                    this.nodeToService.delete(nodeName); // Remove from reverse map
                    // Reset round-robin index to avoid out of bounds
                    service.roundRobinIndex = 0;
                }
            } else {
                // Ultra-fast mode: O(1) remove with Map and array
                const serviceData = this.ultraFastHealthyNodes.get(serviceName);
                if (serviceData && serviceData.nodes.has(nodeName)) {
                    serviceData.nodes.delete(nodeName);
                    // Remove from array O(1) by swapping with last element
                    const index = serviceData.array.findIndex(n => n.nodeName === nodeName);
                    if (index > -1) {
                        const lastIndex = serviceData.array.length - 1;
                        if (index !== lastIndex) {
                            // Swap with last element
                            serviceData.array[index] = serviceData.array[lastIndex];
                        }
                        serviceData.array.pop();
                        // Update available nodes
                        serviceData.available = serviceData.array.filter(n => !this.isInMaintenance(serviceName, n.nodeName) && !this.isInDraining(serviceName, n.nodeName));
                    }
                }
            }
            // Invalidate ultra-fast cache for this service
            if (this.discoveryService) {
                this.discoveryService.invalidateUltraFastCache(serviceName);
            }
            // Skip addChange in fast modes for performance
            return;
        }

        if (this.healthyNodes.has(serviceName)) {
            const arr = this.healthyNodes.get(serviceName);
            const set = this.healthyNodeSets.get(serviceName);
            const map = this.healthyNodesMap.get(serviceName);
            const avail = this.availableNodes.get(serviceName);
            const index = arr.findIndex(n => n.nodeName === nodeName);
            if (index > -1) {
                arr.splice(index, 1);
                set.delete(nodeName);
                map.delete(nodeName);
                avail.delete(nodeName);
                // Remove from availableNodesArray
                const availArr = this.availableNodesArray.get(serviceName);
                if (availArr) {
                    const index = availArr.findIndex(n => n.nodeName === nodeName);
                    if (index > -1) availArr.splice(index, 1);
                }
                // Remove from group index
                const service = this.registry.get(serviceName);
                const node = service && service.nodes[nodeName];
                if (node && node.metadata.group && this.groupIndex.has(serviceName)) {
                    const groupMap = this.groupIndex.get(serviceName);
                    if (groupMap.has(node.metadata.group)) {
                        groupMap.get(node.metadata.group).delete(nodeName);
                        if (groupMap.get(node.metadata.group).size === 0) groupMap.delete(node.metadata.group);
                    }
                    if (groupMap.size === 0) this.groupIndex.delete(serviceName);
                }
                this.removeFromHashRegistry(serviceName, nodeName);
                this.invalidateServiceCaches(serviceName);
                this.addChange('unhealthy', serviceName, nodeName, { healthy: false });
            }
        }
    }

    incrementActiveConnections = (serviceName, nodeName) => {
        if (config.lightningMode) {
            this.activeConnections.set(nodeName, (this.activeConnections.get(nodeName) || 0) + 1);
        } else {
            const key = `${serviceName}:${nodeName}`;
            this.activeConnections.set(key, (this.activeConnections.get(key) || 0) + 1);
        }
    }

    decrementActiveConnections = (serviceName, nodeName) => {
        if (config.lightningMode) {
            const current = this.activeConnections.get(nodeName);
            if (current > 0) {
                this.activeConnections.set(nodeName, current - 1);
            }
        } else {
            const key = `${serviceName}:${nodeName}`;
            const current = this.activeConnections.get(key);
            if (current > 0) {
                this.activeConnections.set(key, current - 1);
            }
        }
    }

    getActiveConnections = (serviceName, nodeName) => {
        const key = `${serviceName}:${nodeName}`;
        return this.activeConnections.get(key) || 0;
    }

    recordResponseTime = (serviceName, nodeName, responseTime) => {
        const key = `${serviceName}:${nodeName}`;
        if (!this.responseTimes.has(key)) {
            this.responseTimes.set(key, {times: [], sum: 0});
        }
        const data = this.responseTimes.get(key);
        data.times.push(responseTime);
        data.sum += responseTime;
        // Keep only last 10 response times
        if (data.times.length > 10) {
            const removed = data.times.shift();
            data.sum -= removed;
        }
        // Update cached average
        this.averageResponseTimes.set(key, data.sum / data.times.length);
    }

    getAverageResponseTime = (serviceName, nodeName) => {
        const key = `${serviceName}:${nodeName}`;
        return this.averageResponseTimes.get(key) || 0;
    }

    calculateHealthScore = (serviceName, nodeName) => {
        const key = `${serviceName}:${nodeName}`;
        const service = this.registry.get(serviceName);
        if (!service || !service.nodes[nodeName]) return 0;
        const node = service.nodes[nodeName];
        const failureRate = (node.failureCount || 0) / ((node.failureCount || 0) + (node.successCount || 1)); // better calculation
        const avgResponseTime = this.getAverageResponseTime(serviceName, nodeName) || 1; // avoid division by zero
        const uptime = this.getHealthHistory(serviceName, nodeName).filter(h => h.status).length / Math.max(1, this.getHealthHistory(serviceName, nodeName).length);
        const score = (uptime * 0.5) + ((1 - failureRate) * 0.3) + ((1000 / (avgResponseTime + 1)) * 0.2); // weighted score
        this.healthScore.set(key, score);
        return score;
    }

    getHealthScore = (serviceName, nodeName) => {
        const key = `${serviceName}:${nodeName}`;
        return this.healthScore.get(key) || this.calculateHealthScore(serviceName, nodeName);
    }

    getHealthScores = (serviceName) => {
        const service = this.registry.get(serviceName);
        if (!service || !service.nodes) return {};
        const scores = {};
        for (const nodeName of Object.keys(service.nodes)) {
            scores[nodeName] = this.getHealthScore(serviceName, nodeName);
        }
        return scores;
    }

    getAnomalies = () => {
        const anomalies = [];
        for (const serviceName of this.registry.keys()) {
            const service = this.registry.get(serviceName);
            const healthyNodes = this.getHealthyNodes(serviceName);
            if (healthyNodes.length === 0) {
                anomalies.push({
                    serviceName,
                    type: 'no_healthy_nodes',
                    value: 0
                });
            }
            if (!service.nodes || Object.keys(service.nodes).length === 0) {
                anomalies.push({
                    serviceName,
                    type: 'no_nodes',
                    value: 0
                });
            }
            // Check circuit breaker failures
            let totalFailures = 0;
            for (const nodeName of Object.keys(service.nodes || {})) {
                const cb = this.circuitBreaker.get(`${serviceName}:${nodeName}`);
                if (cb) {
                    totalFailures += cb.failures;
                }
            }
            if (totalFailures > 10) { // Threshold
                anomalies.push({
                    serviceName,
                    type: 'high_circuit_failures',
                    value: totalFailures
                });
            }
        }
        return anomalies;
    }

    // Circuit Breaker methods
    isCircuitOpen = (serviceName, nodeName) => {
        if (!config.circuitBreakerEnabled) return false;
        const key = `${serviceName}:${nodeName}`;
        const cb = this.circuitBreaker.get(key);
        if (!cb) return false;
        if (cb.state === 'open') {
            if (Date.now() > cb.nextTry) {
                cb.state = 'half-open';
                return false; // Allow one request
            }
            return true;
        }
        return false;
    }

    recordCircuitFailure = (serviceName, nodeName) => {
        if (!config.circuitBreakerEnabled) return;
        const key = `${serviceName}:${nodeName}`;
        let cb = this.circuitBreaker.get(key);
        if (!cb) {
            cb = { state: 'closed', failures: 0, lastFailure: 0, nextTry: 0 };
            this.circuitBreaker.set(key, cb);
        }
        cb.failures++;
        cb.lastFailure = Date.now();
        if (cb.failures >= config.circuitBreakerFailureThreshold) {
            cb.state = 'open';
            cb.nextTry = Date.now() + config.circuitBreakerTimeout;
        }
    }

    recordCircuitSuccess = (serviceName, nodeName) => {
        if (!config.circuitBreakerEnabled) return;
        const key = `${serviceName}:${nodeName}`;
        const cb = this.circuitBreaker.get(key);
        if (cb) {
            if (cb.state === 'half-open') {
                cb.state = 'closed';
                cb.failures = 0;
            }
        }
    }

    addNodeToHashRegistry = (serviceName, nodeName) => {
        this.initHashRegistry(serviceName);
        const hashRing = this.hashRegistry.get(serviceName);
        if(hashRing.servers.includes(nodeName)) return;
        hashRing.add(nodeName);
        this.debounceSave();
    }

    addToHashRegistry = (serviceName, nodeName) => {
        this.initHashRegistry(serviceName);
        const hashRing = this.hashRegistry.get(serviceName);
        if(hashRing.servers.includes(nodeName)) return;
        hashRing.add(nodeName);
    }

    removeFromHashRegistry = (serviceName, nodeName) => {
        const hashRing = this.hashRegistry.get(serviceName);
        if (hashRing) {
            try {
                hashRing.remove(nodeName);
            } catch (err) {
                consoleError('Error removing from hash ring:', err);
            }
        }
    }

    removeNodeFromRegistry = (serviceName, nodeName) => {
        const service = this.registry.get(serviceName);
        const node = service?.nodes[nodeName];
        if (node) this.removeFromTagIndex(nodeName, node.metadata.tags);
        this.removeFromHashRegistry(serviceName, nodeName);
        this.removeFromHealthyNodes(serviceName, nodeName);
        // Clear lease (only if leases are used)
        if (this.leases) {
            const key = `${serviceName}:${nodeName}`;
            const lease = this.leases.get(key);
            if (lease) {
                clearTimeout(lease.timeout);
                this.leases.delete(key);
            }
        }
        this.debounceSave();
    }

    saveToFile = async () => {
        try {
            const data = {
                registry: config.lightningMode ? Object.fromEntries(
                    Array.from(this.registry.entries()).map(([k, v]) => [k, { ...v, nodes: Array.from(v.nodes.entries()) }])
                ) : Object.fromEntries(this.registry),
                hashRegistry: Array.from(this.hashRegistry.keys()),
                serviceAliases: Object.fromEntries(this.serviceAliases),
                serviceAliasesReverse: Object.fromEntries(
                    Array.from(this.serviceAliasesReverse.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                serviceDependencies: Object.fromEntries(
                    Array.from(this.serviceDependencies.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                kvStore: Object.fromEntries(this.kvStore),
                trafficSplit: Object.fromEntries(this.trafficSplit),
                healthHistory: Object.fromEntries(
                    Array.from(this.healthHistory.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
                ),
                maintenanceNodes: Object.fromEntries(
                    Array.from(this.maintenanceNodes.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                drainingNodes: Object.fromEntries(
                    Array.from(this.drainingNodes.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                webhooks: Object.fromEntries(
                    Array.from(this.webhooks.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                tagIndex: Object.fromEntries(
                    Array.from(this.tagIndex.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                circuitBreaker: Object.fromEntries(
                    Array.from(this.circuitBreaker.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
                )
            };
            await fs.promises.writeFile(path.join(__dirname, '../../../registry.json'), JSON.stringify(data, null, 2));
        } catch (err) {
            consoleError('Failed to save registry:', err);
        }
    }

    saveToRedis = async () => {
        if (!config.redisEnabled) return;
        if (!this.redisClient) {
            await this.initRedis();
        }
        try {
            const data = {
                registry: Object.fromEntries(this.registry),
                hashRegistry: Array.from(this.hashRegistry.keys()),
                serviceAliases: Object.fromEntries(this.serviceAliases),
                serviceAliasesReverse: Object.fromEntries(
                    Array.from(this.serviceAliasesReverse.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                serviceDependencies: Object.fromEntries(
                    Array.from(this.serviceDependencies.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                kvStore: Object.fromEntries(this.kvStore),
                trafficSplit: Object.fromEntries(this.trafficSplit),
                healthHistory: Object.fromEntries(
                    Array.from(this.healthHistory.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
                ),
                maintenanceNodes: Object.fromEntries(
                    Array.from(this.maintenanceNodes.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                drainingNodes: Object.fromEntries(
                    Array.from(this.drainingNodes.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                webhooks: Object.fromEntries(
                    Array.from(this.webhooks.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                tagIndex: Object.fromEntries(
                    Array.from(this.tagIndex.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                circuitBreaker: Object.fromEntries(
                    Array.from(this.circuitBreaker.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
                )
            };
            await this.redisClient.set('registry', JSON.stringify(data));
        } catch (err) {
            consoleError('Failed to save to Redis:', err);
        }
    }

    saveToEtcd = async () => {
        if (!config.etcdEnabled) return;
        if (!this.etcdClient) {
            await this.initEtcd();
        }
        try {
            const data = {
                registry: Object.fromEntries(this.registry),
                hashRegistry: Array.from(this.hashRegistry.keys()),
                serviceAliases: Object.fromEntries(this.serviceAliases),
                serviceAliasesReverse: Object.fromEntries(
                    Array.from(this.serviceAliasesReverse.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                serviceDependencies: Object.fromEntries(
                    Array.from(this.serviceDependencies.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                kvStore: Object.fromEntries(this.kvStore),
                trafficSplit: Object.fromEntries(this.trafficSplit),
                healthHistory: Object.fromEntries(
                    Array.from(this.healthHistory.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
                ),
                maintenanceNodes: Object.fromEntries(
                    Array.from(this.maintenanceNodes.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                drainingNodes: Object.fromEntries(
                    Array.from(this.drainingNodes.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                webhooks: Object.fromEntries(
                    Array.from(this.webhooks.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                tagIndex: Object.fromEntries(
                    Array.from(this.tagIndex.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                circuitBreaker: Object.fromEntries(
                    Array.from(this.circuitBreaker.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
                )
            };
            await this.etcdClient.put('registry').value(JSON.stringify(data));
        } catch (err) {
            consoleError('Failed to save to etcd:', err);
        }
    }

    saveToMongo = async () => {
        if (!config.mongoEnabled) return;
        if (!this.mongoClient) {
            await this.initMongo();
        }
        try {
            const data = this.backup();
            await this.db.collection('registry').replaceOne({}, data, { upsert: true });
        } catch (err) {
            consoleError('Failed to save to Mongo:', err);
        }
    }

    saveToMySQL = async () => {
        if (!config.mysqlEnabled) return;
        if (!this.mysqlClient) {
            await this.initMySQL();
        }
        try {
            const data = this.backup();
            await this.mysqlClient.execute('INSERT INTO registry (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = ?', [JSON.stringify(data), JSON.stringify(data)]);
        } catch (err) {
            consoleError('Failed to save to MySQL:', err);
        }
    }

    saveToCassandra = async () => {
        if (!config.cassandraEnabled) return;
        if (!this.cassandraClient) {
            await this.initCassandra();
        }
        try {
            const data = this.backup();
            await this.cassandraClient.execute(`INSERT INTO ${config.cassandraKeyspace}.registry (id, data) VALUES (?, ?)`, ['registry', JSON.stringify(data)]);
        } catch (err) {
            consoleError('Failed to save to Cassandra:', err);
        }
    }

    debounceSave = () => {
        if (config.extremeFastMode || config.ultraFastMode || (!config.persistenceEnabled && !config.mongoEnabled && !config.postgresEnabled && !config.mysqlEnabled && !config.cassandraEnabled)) return;
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(async () => {
            if (config.cassandraEnabled) {
                await this.saveToCassandra();
            } else if (config.mongoEnabled) {
                await this.saveToMongo();
            } else if (config.postgresEnabled) {
                await this.saveToPostgres();
            } else if (config.mysqlEnabled) {
                await this.saveToMySQL();
            } else if (config.etcdEnabled) {
                await this.saveToEtcd();
            } else if (config.redisEnabled) {
                await this.saveToRedis();
            } else {
                this.saveToFile();
            }
        }, 2000); // debounce for 2s
    }

    loadFromRedis = async () => {
        if (!this.redisClient) return;
        try {
            const dataStr = await this.redisClient.get('registry');
            if (dataStr) {
                const data = JSON.parse(dataStr);
                this.registry = new Map(Object.entries(data.registry || {}));
                // Load aliases
                this.serviceAliases = new Map(Object.entries(data.serviceAliases || {}));
                this.serviceAliasesReverse = new Map(
                    Object.entries(data.serviceAliasesReverse || {}).map(([k, v]) => [k, new Set(v)])
                );
                // Load dependencies
                this.serviceDependencies = new Map(
                    Object.entries(data.serviceDependencies || {}).map(([k, v]) => [k, new Set(v)])
                );
                // Load KV store
                this.kvStore = new Map(Object.entries(data.kvStore || {}));
                // Load traffic split
                this.trafficSplit = new Map(Object.entries(data.trafficSplit || {}));
                // Load health history
                this.healthHistory = new Map(
                    Object.entries(data.healthHistory || {}).map(([k, v]) => [k, new Map(Object.entries(v))])
                );
                // Load maintenance nodes
                this.maintenanceNodes = new Map(
                    Object.entries(data.maintenanceNodes || {}).map(([k, v]) => [k, new Set(v)])
                );
                // Load draining nodes
                this.drainingNodes = new Map(
                    Object.entries(data.drainingNodes || {}).map(([k, v]) => [k, new Set(v)])
                );
                // Load webhooks
                this.webhooks = new Map(
                    Object.entries(data.webhooks || {}).map(([k, v]) => [k, new Set(v)])
                );
                // Load tag index
                this.tagIndex = new Map(
                    Object.entries(data.tagIndex || {}).map(([k, v]) => [k, new Set(v)])
                );
                // Load circuit breaker
                this.circuitBreaker = new Map(
                    Object.entries(data.circuitBreaker || {}).map(([k, v]) => [k, new Map(Object.entries(v))])
                );
                // Load available nodes
                this.availableNodes = new Map(
                    Object.entries(data.availableNodes || {}).map(([k, v]) => [k, new Map(Object.entries(v))])
                );
                        // Reinitialize hashRegistry and healthyNodes
                    this.healthyNodeSets = new Map();
                   for (const serviceName of data.hashRegistry || []) {
                       this.initHashRegistry(serviceName);
                       const nodes = this.getNodes(serviceName);
                       for (const nodeName of Object.keys(nodes || {})) {
                           this.addNodeToHashRegistry(serviceName, nodeName);
                           if (nodes[nodeName].healthy !== false) { // assuming healthy is true by default
                               this.addToHealthyNodes(serviceName, nodeName);
                               this.addToHashRegistry(serviceName, nodeName);
                           }
                           this.addToTagIndex(nodeName, nodes[nodeName].metadata.tags);
                       }
                   }
            }
        } catch (err) {
            consoleError('Failed to load from Redis:', err);
        }
    }

    async initEtcd() {
        if (!config.etcdEnabled || this.etcdClient) return;
        const etcd3 = require('etcd3');
        this.etcdClient = new etcd3.Etcd3({ hosts: `${config.etcdHost}:${config.etcdPort}` });
        this.loadFromEtcd();
    }

    loadFromEtcd = async () => {
        if (!this.etcdClient) return;
        try {
            const dataStr = await this.etcdClient.get('registry').string();
            if (dataStr) {
                const data = JSON.parse(dataStr);
                this.registry = new Map(Object.entries(data.registry || {}));
                // Load aliases
                this.serviceAliases = new Map(Object.entries(data.serviceAliases || {}));
                this.serviceAliasesReverse = new Map(
                    Object.entries(data.serviceAliasesReverse || {}).map(([k, v]) => [k, new Set(v)])
                );
                // Load dependencies
                this.serviceDependencies = new Map(
                    Object.entries(data.serviceDependencies || {}).map(([k, v]) => [k, new Set(v)])
                );
                // Load KV store
                this.kvStore = new Map(Object.entries(data.kvStore || {}));
                // Load traffic split
                this.trafficSplit = new Map(Object.entries(data.trafficSplit || {}));
                // Load health history
                this.healthHistory = new Map(
                    Object.entries(data.healthHistory || {}).map(([k, v]) => [k, new Map(Object.entries(v))])
                );
                // Load maintenance nodes
                this.maintenanceNodes = new Map(
                    Object.entries(data.maintenanceNodes || {}).map(([k, v]) => [k, new Set(v)])
                );
                // Load draining nodes
                this.drainingNodes = new Map(
                    Object.entries(data.drainingNodes || {}).map(([k, v]) => [k, new Set(v)])
                );
                // Load webhooks
                this.webhooks = new Map(
                    Object.entries(data.webhooks || {}).map(([k, v]) => [k, new Set(v)])
                );
                // Load tag index
                this.tagIndex = new Map(
                    Object.entries(data.tagIndex || {}).map(([k, v]) => [k, new Set(v)])
                );
                // Load circuit breaker
                this.circuitBreaker = new Map(
                    Object.entries(data.circuitBreaker || {}).map(([k, v]) => [k, new Map(Object.entries(v))])
                );
                // Load available nodes
                this.availableNodes = new Map(
                    Object.entries(data.availableNodes || {}).map(([k, v]) => [k, new Set(v)])
                );
                        // Reinitialize hashRegistry and healthyNodes
                        this.healthyNodeSets = new Map();
                       for (const serviceName of data.hashRegistry || []) {
                           this.initHashRegistry(serviceName);
                           const nodes = this.getNodes(serviceName);
                           for (const nodeName of Object.keys(nodes || {})) {
                               this.addNodeToHashRegistry(serviceName, nodeName);
                           if (nodes[nodeName].healthy !== false) { // assuming healthy is true by default
                               this.addToHealthyNodes(serviceName, nodeName);
                           }
                           this.addToTagIndex(nodeName, nodes[nodeName].metadata.tags);
                            }
                   }
               }
           } catch (err) {
               consoleError('Failed to load from etcd:', err);
           }
      }

    async initMongo() {
        if (!config.mongoEnabled || this.mongoClient) return;
        const { MongoClient } = require('mongodb');
        this.mongoClient = new MongoClient(config.mongoUrl);
        await this.mongoClient.connect();
        this.db = this.mongoClient.db();
        this.loadFromMongo();
    }

    loadFromMongo = async () => {
        if (!this.mongoClient) return;
        try {
            const data = await this.db.collection('registry').findOne({});
            if (data) {
                this.restore(data);
            }
        } catch (err) {
            consoleError('Failed to load from Mongo:', err);
        }
    }

    async initPostgres() {
        if (!config.postgresEnabled || this.postgresClient) return;
        const { Pool } = require('pg');
        this.postgresClient = new Pool({ connectionString: config.postgresUrl });
        await this.postgresClient.connect();
        this.loadFromPostgres();
    }

    loadFromPostgres = async () => {
        if (!this.postgresClient) return;
        try {
            const res = await this.postgresClient.query('SELECT data FROM registry WHERE id = 1');
            if (res.rows.length > 0) {
                const data = JSON.parse(res.rows[0].data);
                this.restore(data);
            }
        } catch (err) {
            consoleError('Failed to load from Postgres:', err);
        }
    }

    async initMySQL() {
        if (!config.mysqlEnabled || this.mysqlClient) return;
        const mysql = require('mysql2/promise');
        this.mysqlClient = await mysql.createConnection(config.mysqlUrl);
        this.loadFromMySQL();
    }

    loadFromMySQL = async () => {
        if (!this.mysqlClient) return;
        try {
            const [rows] = await this.mysqlClient.execute('SELECT data FROM registry WHERE id = 1');
            if (rows.length > 0) {
                const data = JSON.parse(rows[0].data);
                this.restore(data);
            }
        } catch (err) {
            consoleError('Failed to load from MySQL:', err);
        }
    }

    async initCassandra() {
        if (!config.cassandraEnabled || this.cassandraClient) return;
        const cassandra = require('cassandra-driver');
        this.cassandraClient = new cassandra.Client({
            contactPoints: config.cassandraContactPoints,
            keyspace: config.cassandraKeyspace,
            localDataCenter: 'datacenter1'
        });
        await this.cassandraClient.connect();
        // Create keyspace and table if not exists
        await this.cassandraClient.execute(`CREATE KEYSPACE IF NOT EXISTS ${config.cassandraKeyspace} WITH REPLICATION = {'class': 'SimpleStrategy', 'replication_factor': 1}`);
        await this.cassandraClient.execute(`CREATE TABLE IF NOT EXISTS ${config.cassandraKeyspace}.registry (id text PRIMARY KEY, data text)`);
        this.loadFromCassandra();
    }

    loadFromCassandra = async () => {
        if (!this.cassandraClient) return;
        try {
            const result = await this.cassandraClient.execute(`SELECT data FROM ${config.cassandraKeyspace}.registry WHERE id = 'registry'`);
            if (result.rows.length > 0) {
                const data = JSON.parse(result.rows[0].data);
                this.restore(data);
            }
        } catch (err) {
            consoleError('Failed to load from Cassandra:', err);
        }
    }

    loadFromFile = async () => {
        try {
            const filePath = path.join(__dirname, '../../../registry.json');
            if (fs.existsSync(filePath)) {
                    const content = (await fs.promises.readFile(filePath, 'utf8')).trim();
                    if (content) {
                        const data = JSON.parse(content);
                        if (config.lightningMode) {
                            this.registry = new Map(
                                Object.entries(data.registry || {}).map(([k, v]) => [k, { ...v, nodes: new Map(v.nodes) }])
                            );
                        } else {
                            this.registry = new Map(Object.entries(data.registry || {}));
                        }
                        // Load aliases
                        this.serviceAliases = new Map(Object.entries(data.serviceAliases || {}));
                        this.serviceAliasesReverse = new Map(
                            Object.entries(data.serviceAliasesReverse || {}).map(([k, v]) => [k, new Set(v)])
                        );
                        // Load dependencies
                        this.serviceDependencies = new Map(
                            Object.entries(data.serviceDependencies || {}).map(([k, v]) => [k, new Set(v)])
                        );
                        // Load KV store
                        this.kvStore = new Map(Object.entries(data.kvStore || {}));
                        // Load traffic split
                        this.trafficSplit = new Map(Object.entries(data.trafficSplit || {}));
                        // Load health history
                        this.healthHistory = new Map(
                            Object.entries(data.healthHistory || {}).map(([k, v]) => [k, new Map(Object.entries(v))])
                        );
                        // Load maintenance nodes
                        this.maintenanceNodes = new Map(
                            Object.entries(data.maintenanceNodes || {}).map(([k, v]) => [k, new Set(v)])
                        );
                        // Load draining nodes
                        this.drainingNodes = new Map(
                            Object.entries(data.drainingNodes || {}).map(([k, v]) => [k, new Set(v)])
                        );
                        // Load webhooks
                        this.webhooks = new Map(
                            Object.entries(data.webhooks || {}).map(([k, v]) => [k, new Set(v)])
                        );
                  // Load tag index
                  this.tagIndex = new Map(
                      Object.entries(data.tagIndex || {}).map(([k, v]) => [k, new Set(v)])
                  );
                    // Load group index
                    this.groupIndex = new Map(
                        Object.entries(data.groupIndex || {}).map(([k, v]) => [k, new Map(
                            Object.entries(v).map(([k2, v2]) => [k2, new Map(Object.entries(v2))])
                        )])
                    );
                   // Load circuit breaker
                   this.circuitBreaker = new Map(Object.entries(data.circuitBreaker || {}));
                 // Load available nodes
                 this.availableNodes = new Map(
                     Object.entries(data.availableNodes || {}).map(([k, v]) => [k, new Map(Object.entries(v))])
                 );
                  // Reinitialize hashRegistry and healthyNodes
                  this.healthyNodeSets = new Map();
                  if (config.lightningMode) {
                      // For lightning mode, nodes are already Maps
                  } else {
                      for (const serviceName of data.hashRegistry || []) {
                          this.initHashRegistry(serviceName);
                          const nodes = this.getNodes(serviceName);
                          for (const nodeName of Object.keys(nodes || {})) {
                              this.addNodeToHashRegistry(serviceName, nodeName);
                              if (nodes[nodeName].healthy !== false) { // assuming healthy is true by default
                                  this.addToHealthyNodes(serviceName, nodeName);
                              }
                              this.addToTagIndex(nodeName, nodes[nodeName].metadata.tags);
                          }
                      }
                  }
                  }
              }
          } catch (err) {
              consoleError('Failed to load registry:', err);
          }
    }

    setCircuitBreaker(serviceName, nodeName, state, failures = 0, lastFailure = 0, nextTry = 0) {
        const key = `${serviceName}:${nodeName}`;
        this.circuitBreaker.set(key, {state, failures, lastFailure, nextTry});
    }

    getCircuitBreaker(serviceName, nodeName) {
        const key = `${serviceName}:${nodeName}`;
        return this.circuitBreaker.get(key) || {state: 'closed', failures: 0, lastFailure: 0, nextTry: 0};
    }

    incrementCircuitFailures(serviceName, nodeName) {
        const cb = this.getCircuitBreaker(serviceName, nodeName);
        cb.failures++;
        cb.lastFailure = Date.now();
        if (cb.state === 'half-open' || cb.failures >= config.circuitBreakerFailureThreshold) {
            cb.state = 'open';
            cb.nextTry = Date.now() + config.circuitBreakerTimeout;
        }
        this.setCircuitBreaker(serviceName, nodeName, cb.state, cb.failures, cb.lastFailure, cb.nextTry);
    }

    resetCircuitFailures(serviceName, nodeName) {
        this.setCircuitBreaker(serviceName, nodeName, 'closed', 0, 0, 0);
    }

    isCircuitOpen(serviceName, nodeName) {
        const cb = this.getCircuitBreaker(serviceName, nodeName);
        if (cb.state === 'open') {
            if (Date.now() > cb.nextTry) {
                cb.state = 'half-open';
                this.setCircuitBreaker(serviceName, nodeName, cb.state, cb.failures, cb.lastFailure, cb.nextTry);
                return false;
            }
            return true;
        }
        return false;
    }

    updateNodeMetadata = (serviceName, nodeName, metadata) => {
        const service = this.registry.get(serviceName);
        if (service && service.nodes[nodeName]) {
            service.nodes[nodeName].metadata = { ...service.nodes[nodeName].metadata, ...metadata };
            // Update tag index if tags changed
            if (metadata.tags) {
                this.removeFromTagIndex(nodeName, service.nodes[nodeName].metadata.tags);
                this.addToTagIndex(nodeName, metadata.tags);
            }
            this.debounceSave();
            // Invalidate caches
            for (const key of this.healthyCache.keys()) {
                if (key === serviceName || key.startsWith(serviceName + ':')) {
                    this.healthyCache.delete(key);
                    this.sortedHealthyCache.delete(key);
                }
            }
            discoveryService.invalidateServiceCache(serviceName);
        }
    }

    onCircuitSuccess(serviceName, nodeName) {
        const cb = this.getCircuitBreaker(serviceName, nodeName);
        if (cb.state === 'half-open') {
            cb.state = 'closed';
        }
        cb.failures = 0;
        cb.lastFailure = 0;
        cb.nextTry = 0;
        this.setCircuitBreaker(serviceName, nodeName, cb.state, cb.failures, cb.lastFailure, cb.nextTry);
    }

    onCircuitFailure(serviceName, nodeName) {
        const cb = this.getCircuitBreaker(serviceName, nodeName);
        if (cb.state === 'half-open') {
            cb.state = 'open';
            cb.nextTry = Date.now() + config.circuitBreakerTimeout;
            this.setCircuitBreaker(serviceName, nodeName, cb.state, cb.failures, cb.lastFailure, cb.nextTry);
        }
    }

    setApiSpec(serviceName, apiSpec) {
        this.apiSpecs.set(serviceName, apiSpec);
    }

    getApiSpec(serviceName) {
        return this.apiSpecs.get(serviceName);
    }

    addServiceTemplate(templateName, template) {
        this.serviceTemplates.set(templateName, template);
    }

    getServiceTemplate(templateName) {
        return this.serviceTemplates.get(templateName);
    }

    deleteServiceTemplate(templateName) {
        return this.serviceTemplates.delete(templateName);
    }

    listServiceTemplates() {
        return Array.from(this.serviceTemplates.keys());
    }

    addAclPolicy(policyName, policy) {
        this.aclPolicies.set(policyName, policy);
    }

    getAclPolicy(policyName) {
        return this.aclPolicies.get(policyName);
    }

    deleteAclPolicy(policyName) {
        return this.aclPolicies.delete(policyName);
    }

    listAclPolicies() {
        return Array.from(this.aclPolicies.keys());
    }

    setServiceIntention(serviceName, intention) {
        this.serviceIntentions.set(serviceName, intention);
    }

    getServiceIntention(serviceName) {
        return this.serviceIntentions.get(serviceName);
    }

    addPendingService(service) {
        this.pendingServices.set(service.serviceName, service);
    }

    getPendingServices() {
        return Array.from(this.pendingServices.values());
    }

    approveService(serviceName) {
        const service = this.pendingServices.get(serviceName);
        if (service) {
            this.pendingServices.delete(serviceName);
            this.registry.set(serviceName, service);
            this.addChange('register', serviceName, Object.keys(service.nodes)[0], service);
        }
        return service;
    }

    rejectService(serviceName) {
        return this.pendingServices.delete(serviceName);
    }

    testService(serviceName, nodeName) {
        // Simulate health check
        const service = this.registry.get(serviceName);
        if (service && service.nodes[nodeName]) {
            return { healthy: true };
        }
        return { healthy: false };
    }

    // ACL methods
    setACL(serviceName, acl) {
        this.acls.set(serviceName, acl);
    }

    getACL(serviceName) {
        return this.acls.get(serviceName) || { allow: [], deny: [] };
    }

    setIntention(source, destination, action) {
        const key = `${source}:${destination}`;
        this.intentions.set(key, action);
    }

    getIntention(source, destination) {
        const key = `${source}:${destination}`;
        return this.intentions.get(key) || 'deny';
    }

    // Additional features for full mode
    federatedRegistries = new Map();

    addFederatedRegistry(name, url) {
        this.federatedRegistries.set(name, { name, url });
    }

    removeFederatedRegistry(name) {
        this.federatedRegistries.delete(name);
    }

    async getFederatedNode(serviceName, strategy, clientId) {
        // Try local first
        let node = this.getRandomNode(serviceName, strategy, clientId);
        if (node) return node;
        // Query federated
        const axios = require('axios');
        for (const [name, reg] of this.federatedRegistries) {
            try {
                const response = await axios.get(`${reg.url}/discover?serviceName=${serviceName}&strategy=${strategy}&clientId=${clientId || ''}`, { timeout: 1000 });
                if (response.status === 200 && response.data.address) {
                    return { address: response.data.address, nodeName: response.data.nodeName, healthy: true };
                }
            } catch (e) {
                // ignore
            }
        }
        return null;
    }

    traces = new Map();

    startTrace(operation, id) {
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
        }
    }

    getTrace(id) {
        return this.traces.get(id) || {};
    }

    acls = new Map();

    setACL(serviceName, allow, deny) {
        this.acls.set(serviceName, {allow: new Set(allow), deny: new Set(deny)});
    }

    getACL(serviceName) {
        return this.acls.get(serviceName) || {allow: new Set(), deny: new Set()};
    }

    intentions = new Map();

    setIntention(source, destination, action) {
        if (!this.intentions.has(source)) this.intentions.set(source, new Map());
        this.intentions.get(source).set(destination, action);
    }

    getIntention(source, destination) {
        const srcMap = this.intentions.get(source);
        return srcMap ? srcMap.get(destination) : null;
    }
    blacklists = new Set();

    addToBlacklist(serviceName) {
        this.blacklists.add(serviceName);
    }

    removeFromBlacklist(serviceName) {
        this.blacklists.delete(serviceName);
    }

    isBlacklisted(serviceName) {
        return this.blacklists.has(serviceName);
    }

    // Chaos engineering methods
    chaosLatency = new Map(); // serviceName -> delay in ms
    chaosFailure = new Map(); // serviceName -> failure rate (0-1)

    injectLatency(serviceName, delay) {
        this.chaosLatency.set(serviceName, delay);
    }

    injectFailure(serviceName, rate) {
        this.chaosFailure.set(serviceName, rate);
    }

    resetChaos(serviceName) {
        this.chaosLatency.delete(serviceName);
        this.chaosFailure.delete(serviceName);
    }

    getChaosStatus() {
        return {
            latency: Object.fromEntries(this.chaosLatency),
            failure: Object.fromEntries(this.chaosFailure)
        };
    }
}

const serviceRegistry = new ServiceRegistry();

module.exports = {
    serviceRegistry
}