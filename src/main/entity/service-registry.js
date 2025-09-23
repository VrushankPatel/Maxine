const HashRing = require('hashring');
const { constants } = require('../util/constants/constants');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
let redis;
if (config.redisEnabled) {
    redis = require('redis');
}
let etcd3;
if (config.etcdEnabled) {
    etcd3 = require('etcd3');
}
let { Kafka } = require('kafkajs');
if (config.kafkaEnabled) {
    Kafka = require('kafkajs').Kafka;
}

class ServiceRegistry{
    registry = new Map();
    timeResetters = new Map();
    hashRegistry = new Map();
    healthyNodes = new Map(); // serviceName -> array of healthy node objects, sorted by priority desc
    healthyCache = new Map(); // serviceName -> array of healthy node objects, filtered maintenance
    healthyNodeSets = new Map(); // serviceName -> Set of nodeNames for O(1) existence check
    maintenanceNodes = new Map(); // serviceName -> Set of nodeNames in maintenance
    activeConnections = new Map();
    responseTimes = new Map();
    averageResponseTimes = new Map(); // cache averages
    saveTimeout = null;
    changes = [];
    webhooks = new Map(); // serviceName -> set of webhook URLs
    tagIndex = new Map(); // tag -> Set of nodeNames
    kvStore = new Map(); // key -> value
    trafficSplit = new Map(); // baseServiceName -> {version: percent}
    healthHistory = new Map(); // serviceName -> nodeName -> array of {timestamp, status}

    constructor() {
        if (config.kafkaEnabled) {
            this.kafka = new Kafka({
                clientId: 'maxine-registry',
                brokers: config.kafkaBrokers
            });
            this.producer = this.kafka.producer();
            this.producer.connect().catch(err => console.error('Kafka producer connect error:', err));
        }
        if (config.etcdEnabled) {
            this.etcdClient = new etcd3.Etcd3({ hosts: `${config.etcdHost}:${config.etcdPort}` });
            this.loadFromEtcd().catch(err => console.error('Etcd load error:', err));
        } else if (config.redisEnabled) {
            this.redisClient = redis.createClient({
                host: config.redisHost,
                port: config.redisPort,
                password: config.redisPassword
            });
            this.redisClient.on('error', (err) => console.error('Redis error:', err));
            this.redisClient.connect().then(() => this.loadFromRedis()).catch(err => console.error('Redis connect error:', err));
        } else {
            this.loadFromFile();
        }
        this.circuitBreaker = new Map();
    }

    getRegServers = () => Object.fromEntries(this.registry);

    // Service aliases support
    serviceAliases = new Map(); // alias -> primaryServiceName
    serviceAliasesReverse = new Map(); // primaryServiceName -> Set of aliases
    serviceDependencies = new Map(); // serviceName -> Set of dependent services

    addChange = (type, serviceName, nodeName, data) => {
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
        // Notify webhooks asynchronously
        this.notifyWebhooks(serviceName, change);
        // Send to Kafka
        if (config.kafkaEnabled && this.producer) {
            this.producer.send({
                topic: 'maxine-registry-events',
                messages: [{ value: JSON.stringify(change) }]
            }).catch(err => console.error('Kafka send error:', err));
        }
    }

    notifyWebhooks = (serviceName, change) => {
        const urls = this.getWebhooks(serviceName);
        urls.forEach(url => {
            // Send POST request to webhook
            const axios = require('axios');
            axios.post(url, change, { timeout: 5000 }).catch(err => {
                console.error('Webhook notification failed:', url, err.message);
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
            maintenanceNodes: Object.fromEntries(
                Array.from(this.maintenanceNodes.entries()).map(([k, v]) => [k, Array.from(v)])
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
        this.maintenanceNodes = new Map(
            Object.entries(data.maintenanceNodes || {}).map(([k, v]) => [k, new Set(v)])
        );
        this.webhooks = new Map(
            Object.entries(data.webhooks || {}).map(([k, v]) => [k, new Set(v)])
        );
        this.tagIndex = new Map(
            Object.entries(data.tagIndex || {}).map(([k, v]) => [k, new Set(v)])
        );
        this.circuitBreaker = new Map(
            Object.entries(data.circuitBreaker || {}).map(([k, v]) => [k, new Map(Object.entries(v))])
        );
         // Reinitialize hashRegistry and healthyNodes
         this.hashRegistry = new Map();
         this.healthyNodes = new Map();
         this.healthyCache = new Map();
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
        if (inMaintenance) {
            if (!this.maintenanceNodes.has(serviceName)) {
                this.maintenanceNodes.set(serviceName, new Set());
            }
            this.maintenanceNodes.get(serviceName).add(nodeName);
        } else {
            if (this.maintenanceNodes.has(serviceName)) {
                this.maintenanceNodes.get(serviceName).delete(nodeName);
                if (this.maintenanceNodes.get(serviceName).size === 0) {
                    this.maintenanceNodes.delete(serviceName);
                }
            }
        }
        // Invalidate all cache entries for this service (including groups)
        for (const key of this.healthyCache.keys()) {
            if (key === serviceName || key.startsWith(serviceName + ':')) {
                this.healthyCache.delete(key);
            }
        }
        this.debounceSave();
    }

    isInMaintenance = (serviceName, nodeName) => {
        return this.maintenanceNodes.has(serviceName) && this.maintenanceNodes.get(serviceName).has(nodeName);
    }

    getNodes = (serviceName) => {

        const service = this.registry.get(serviceName);

        return service ? service.nodes : {};

    };

    getHealthyNodes = (serviceName, group) => {
        const cacheKey = group ? `${serviceName}:${group}` : serviceName;
        if (!this.healthyCache.has(cacheKey)) {
            const all = this.healthyNodes.get(serviceName) || [];
            const maintenance = this.maintenanceNodes.has(serviceName) ? this.maintenanceNodes.get(serviceName) : new Set();
            let filtered = all.filter(node => !maintenance.has(node.nodeName));
            if (group) {
                filtered = filtered.filter(node => node.metadata.group === group);
            }
            this.healthyCache.set(cacheKey, filtered);
        }
        return this.healthyCache.get(cacheKey);
    }



    initHashRegistry = (serviceName) => {
        if(!this.hashRegistry.has(serviceName)){
            this.hashRegistry.set(serviceName, new HashRing());
        }
    }

    addToHealthyNodes = (serviceName, nodeName) => {
        if (!this.healthyNodes.has(serviceName)) {
            this.healthyNodes.set(serviceName, []);
            this.healthyNodeSets.set(serviceName, new Set());
        }
        const arr = this.healthyNodes.get(serviceName);
        const set = this.healthyNodeSets.get(serviceName);
        const service = this.registry.get(serviceName);
        if (!service || !service.nodes[nodeName]) return;
        const node = service.nodes[nodeName];
        if (!set.has(nodeName)) {
            set.add(nodeName);
            arr.push(node);
            arr.sort((a, b) => (b.metadata.priority || 0) - (a.metadata.priority || 0));
            this.addToHashRegistry(serviceName, nodeName);
        }
        // Invalidate all cache entries for this service (including groups)
        for (const key of this.healthyCache.keys()) {
            if (key === serviceName || key.startsWith(serviceName + ':')) {
                this.healthyCache.delete(key);
            }
        }
        this.addChange('healthy', serviceName, nodeName, { healthy: true });
    }

    removeFromHealthyNodes = (serviceName, nodeName) => {
        if (this.healthyNodes.has(serviceName)) {
            const arr = this.healthyNodes.get(serviceName);
            const set = this.healthyNodeSets.get(serviceName);
            const index = arr.findIndex(n => n.nodeName === nodeName);
            if (index > -1) {
                arr.splice(index, 1);
                set.delete(nodeName);
                this.removeFromHashRegistry(serviceName, nodeName);
            }
            // Invalidate all cache entries for this service (including groups)
        for (const key of this.healthyCache.keys()) {
            if (key === serviceName || key.startsWith(serviceName + ':')) {
                this.healthyCache.delete(key);
            }
        }
            this.addChange('unhealthy', serviceName, nodeName, { healthy: false });
        }
    }

    incrementActiveConnections = (serviceName, nodeName) => {
        if (!this.activeConnections.has(serviceName)) {
            this.activeConnections.set(serviceName, new Map());
        }
        const serviceConns = this.activeConnections.get(serviceName);
        serviceConns.set(nodeName, (serviceConns.get(nodeName) || 0) + 1);
    }

    decrementActiveConnections = (serviceName, nodeName) => {
        const serviceConns = this.activeConnections.get(serviceName);
        if (serviceConns && serviceConns.get(nodeName) > 0) {
            serviceConns.set(nodeName, serviceConns.get(nodeName) - 1);
        }
    }

    getActiveConnections = (serviceName, nodeName) => {
        const serviceConns = this.activeConnections.get(serviceName);
        return serviceConns ? serviceConns.get(nodeName) || 0 : 0;
    }

    recordResponseTime = (serviceName, nodeName, responseTime) => {
        if (!this.responseTimes.has(serviceName)) {
            this.responseTimes.set(serviceName, new Map());
        }
        const serviceTimes = this.responseTimes.get(serviceName);
        if (!serviceTimes.has(nodeName)) {
            serviceTimes.set(nodeName, []);
        }
        const times = serviceTimes.get(nodeName);
        times.push(responseTime);
        // Keep only last 10 response times
        if (times.length > 10) {
            times.shift();
        }
        // Update cached average
        if (!this.averageResponseTimes.has(serviceName)) {
            this.averageResponseTimes.set(serviceName, new Map());
        }
        const avgMap = this.averageResponseTimes.get(serviceName);
        avgMap.set(nodeName, times.reduce((a, b) => a + b, 0) / times.length);
    }

    getAverageResponseTime = (serviceName, nodeName) => {
        if (!this.averageResponseTimes.has(serviceName)) return 0;
        const avgMap = this.averageResponseTimes.get(serviceName);
        return avgMap.get(nodeName) || 0;
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
            hashRing.remove(nodeName);
        }
    }

    removeNodeFromRegistry = (serviceName, nodeName) => {
        const node = this.getNode(serviceName, nodeName);
        if (node) this.removeFromTagIndex(nodeName, node.metadata.tags);
        this.removeFromHashRegistry(serviceName, nodeName);
        this.removeFromHealthyNodes(serviceName, nodeName);
        this.debounceSave();
    }

    saveToFile = async () => {
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
                circuitBreaker: Object.fromEntries(
                    Array.from(this.circuitBreaker.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
                )
            };
            await fs.promises.writeFile(path.join(__dirname, '../../../registry.json'), JSON.stringify(data, null, 2));
        } catch (err) {
            console.error('Failed to save registry:', err);
        }
    }

    saveToRedis = async () => {
        if (!config.redisEnabled) return;
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
                circuitBreaker: Object.fromEntries(
                    Array.from(this.circuitBreaker.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
                )
            };
            await this.redisClient.set('registry', JSON.stringify(data));
        } catch (err) {
            console.error('Failed to save to Redis:', err);
        }
    }

    saveToEtcd = async () => {
        if (!config.etcdEnabled) return;
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
            console.error('Failed to save to etcd:', err);
        }
    }

    debounceSave = () => {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            if (config.etcdEnabled) {
                this.saveToEtcd();
            } else if (config.redisEnabled) {
                this.saveToRedis();
            } else {
                this.saveToFile();
            }
        }, 500); // debounce for 500ms
    }

    loadFromRedis = async () => {
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
                // Load circuit breaker
                this.circuitBreaker = new Map(
                    Object.entries(data.circuitBreaker || {}).map(([k, v]) => [k, new Map(Object.entries(v))])
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
            console.error('Failed to load from Redis:', err);
        }
    }

    loadFromEtcd = async () => {
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
            console.error('Failed to load from etcd:', err);
        }
    }

    loadFromFile = () => {
        try {
            const filePath = path.join(__dirname, '../../../registry.json');
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8').trim();
                if (content) {
                    const data = JSON.parse(content);
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
                    // Load circuit breaker
                    this.circuitBreaker = new Map(
                        Object.entries(data.circuitBreaker || {}).map(([k, v]) => [k, new Map(Object.entries(v))])
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
            }
        } catch (err) {
            console.error('Failed to load registry:', err);
        }
    }

    setCircuitBreaker(serviceName, nodeName, state, failures = 0, lastFailure = 0, nextTry = 0) {
        if (!this.circuitBreaker.has(serviceName)) this.circuitBreaker.set(serviceName, new Map());
        this.circuitBreaker.get(serviceName).set(nodeName, {state, failures, lastFailure, nextTry});
    }

    getCircuitBreaker(serviceName, nodeName) {
        if (!this.circuitBreaker.has(serviceName)) return {state: 'closed', failures: 0, lastFailure: 0, nextTry: 0};
        return this.circuitBreaker.get(serviceName).get(nodeName) || {state: 'closed', failures: 0, lastFailure: 0, nextTry: 0};
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
}

const serviceRegistry = new ServiceRegistry();

module.exports = {
    serviceRegistry
}