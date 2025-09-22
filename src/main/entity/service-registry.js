const HashRing = require('hashring');
const { constants } = require('../util/constants/constants');
const fs = require('fs');
const path = require('path');

class ServiceRegistry{
    registry = {};
    timeResetters = {};
    hashRegistry = {};
    healthyNodes = new Map();
    activeConnections = {};
    responseTimes = new Map();
    saveTimeout = null;
    changes = [];
    webhooks = new Map(); // serviceName -> set of webhook URLs

    constructor() {
        this.loadFromFile();
    }

    getRegServers = () => this.registry;

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

    getNodes = (serviceName) => (this.registry[serviceName] || {})["nodes"];

    getHealthyNodes = (serviceName) => this.healthyNodes.has(serviceName) ? Array.from(this.healthyNodes.get(serviceName)) : [];

    initHashRegistry = (serviceName) => {
        if(!this.hashRegistry[serviceName]){
            this.hashRegistry[serviceName] = new HashRing();
        }
    }

    addToHealthyNodes = (serviceName, nodeName) => {
        if (!this.healthyNodes.has(serviceName)) {
            this.healthyNodes.set(serviceName, new Set());
        }
        this.healthyNodes.get(serviceName).add(nodeName);
        this.addChange('healthy', serviceName, nodeName, { healthy: true });
    }

    removeFromHealthyNodes = (serviceName, nodeName) => {
        if (this.healthyNodes.has(serviceName)) {
            this.healthyNodes.get(serviceName).delete(nodeName);
            this.addChange('unhealthy', serviceName, nodeName, { healthy: false });
        }
    }

    incrementActiveConnections = (serviceName, nodeName) => {
        if (!this.activeConnections[serviceName]) {
            this.activeConnections[serviceName] = {};
        }
        this.activeConnections[serviceName][nodeName] = (this.activeConnections[serviceName][nodeName] || 0) + 1;
    }

    decrementActiveConnections = (serviceName, nodeName) => {
        if (this.activeConnections[serviceName] && this.activeConnections[serviceName][nodeName] > 0) {
            this.activeConnections[serviceName][nodeName]--;
        }
    }

    getActiveConnections = (serviceName, nodeName) => {
        return this.activeConnections[serviceName] ? this.activeConnections[serviceName][nodeName] || 0 : 0;
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
    }

    getAverageResponseTime = (serviceName, nodeName) => {
        if (!this.responseTimes.has(serviceName)) return 0;
        const serviceTimes = this.responseTimes.get(serviceName);
        if (!serviceTimes.has(nodeName)) return 0;
        const times = serviceTimes.get(nodeName);
        if (times.length === 0) return 0;
        return times.reduce((a, b) => a + b, 0) / times.length;
    }

    addNodeToHashRegistry = (serviceName, nodeName) => {
        this.initHashRegistry(serviceName);
        if(this.hashRegistry[serviceName].servers.includes(nodeName)) return;
        this.hashRegistry[serviceName].add(nodeName);
        this.debounceSave();
    }

    addToHashRegistry = (serviceName, nodeName) => {
        this.initHashRegistry(serviceName);
        if(this.hashRegistry[serviceName].servers.includes(nodeName)) return;
        this.hashRegistry[serviceName].add(nodeName);
    }

    removeFromHashRegistry = (serviceName, nodeName) => {
        if (this.hashRegistry[serviceName]) {
            this.hashRegistry[serviceName].remove(nodeName);
        }
    }

    removeNodeFromRegistry = (serviceName, nodeName) => {
        this.removeFromHashRegistry(serviceName, nodeName);
        this.removeFromHealthyNodes(serviceName, nodeName);
        this.debounceSave();
    }

    saveToFile = async () => {
        try {
            const data = {
                registry: this.registry,
                hashRegistry: Object.keys(this.hashRegistry)
            };
            await fs.promises.writeFile(path.join(__dirname, '../../../registry.json'), JSON.stringify(data, null, 2));
        } catch (err) {
            console.error('Failed to save registry:', err);
        }
    }

    debounceSave = () => {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            this.saveToFile();
        }, 500); // debounce for 500ms
    }

    loadFromFile = () => {
        try {
            const filePath = path.join(__dirname, '../../../registry.json');
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8').trim();
                if (content) {
                    const data = JSON.parse(content);
                    this.registry = data.registry || {};
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