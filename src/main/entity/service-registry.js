const HashRing = require('hashring');
const { constants } = require('../util/constants/constants');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
let redis;
if (config.redisEnabled) {
    redis = require('redis');
}

class ServiceRegistry{
    registry = new Map();
    timeResetters = new Map();
    hashRegistry = new Map();
    healthyNodes = new Map();
    healthyCache = new Map(); // serviceName -> array of healthy node names
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

    constructor() {
        if (config.redisEnabled) {
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
    }

    getRegServers = () => Object.fromEntries(this.registry);

    // Service aliases support
    serviceAliases = new Map(); // alias -> primaryServiceName
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
        this.debounceSave();
    }

    removeServiceAlias = (alias) => {
        this.serviceAliases.delete(alias);
        this.debounceSave();
    }

    getServiceByAlias = (alias) => {
        return this.serviceAliases.get(alias) || alias; // Return primary name or the alias itself if not found
    }

    getAliasesForService = (serviceName) => {
        const aliases = [];
        for (const [alias, primary] of this.serviceAliases) {
            if (primary === serviceName) {
                aliases.push(alias);
            }
        }
        return aliases;
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
        this.healthyCache.delete(serviceName); // invalidate cache
        this.debounceSave();
    }

    isInMaintenance = (serviceName, nodeName) => {
        return this.maintenanceNodes.has(serviceName) && this.maintenanceNodes.get(serviceName).has(nodeName);
    }

    getNodes = (serviceName) => {

        const service = this.registry.get(serviceName);

        return service ? service.nodes : {};

    };

    getHealthyNodes = (serviceName) => {
        if (!this.healthyCache.has(serviceName)) {
            const healthy = this.healthyNodes.get(serviceName) || [];
            const maintenance = this.maintenanceNodes.has(serviceName) ? this.maintenanceNodes.get(serviceName) : new Set();
            const filtered = healthy.filter(nodeName => !maintenance.has(nodeName));
            this.healthyCache.set(serviceName, filtered);
        }
        return this.healthyCache.get(serviceName);
    }



    initHashRegistry = (serviceName) => {
        if(!this.hashRegistry.has(serviceName)){
            this.hashRegistry.set(serviceName, new HashRing({algorithm: 'md5'}));
        }
    }

    addToHealthyNodes = (serviceName, nodeName) => {
        if (!this.healthyNodes.has(serviceName)) {
            this.healthyNodes.set(serviceName, []);
        }
        const arr = this.healthyNodes.get(serviceName);
        if (!arr.includes(nodeName)) {
            arr.push(nodeName);
        // sort by priority desc
        const nodes = this.getNodes(serviceName);
        arr.sort((a,b) => {
            const priA = nodes[a]?.metadata?.priority || 0;
            const priB = nodes[b]?.metadata?.priority || 0;
            return priB - priA;
        });
        }
        this.healthyCache.delete(serviceName); // invalidate cache
        this.addChange('healthy', serviceName, nodeName, { healthy: true });
    }

    removeFromHealthyNodes = (serviceName, nodeName) => {
        if (this.healthyNodes.has(serviceName)) {
            const arr = this.healthyNodes.get(serviceName);
            const index = arr.indexOf(nodeName);
            if (index > -1) {
                arr.splice(index, 1);
            }
            this.healthyCache.delete(serviceName); // invalidate cache
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
                serviceDependencies: Object.fromEntries(
                    Array.from(this.serviceDependencies.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                kvStore: Object.fromEntries(this.kvStore),
                trafficSplit: Object.fromEntries(this.trafficSplit)
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
                kvStore: Object.fromEntries(this.kvStore),
                trafficSplit: Object.fromEntries(this.trafficSplit)
            };
            await this.redisClient.set('registry', JSON.stringify(data));
        } catch (err) {
            console.error('Failed to save to Redis:', err);
        }
    }

    debounceSave = () => {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            if (config.redisEnabled) {
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
                this.kvStore = new Map(Object.entries(data.kvStore || {}));
                this.trafficSplit = new Map(Object.entries(data.trafficSplit || {}));
                // Reinitialize hashRegistry and healthyNodes
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
                    // Load dependencies
                    this.serviceDependencies = new Map(
                        Object.entries(data.serviceDependencies || {}).map(([k, v]) => [k, new Set(v)])
                    );
                    // Load KV store
                    this.kvStore = new Map(Object.entries(data.kvStore || {}));
                    // Load traffic split
                    this.trafficSplit = new Map(Object.entries(data.trafficSplit || {}));
                    // Reinitialize hashRegistry and healthyNodes
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
            }
        } catch (err) {
            console.error('Failed to load registry:', err);
        }
    }
}

const serviceRegistry = new ServiceRegistry();

module.exports = {
    serviceRegistry
}