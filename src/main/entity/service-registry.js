const ConsistentHashing = require('consistent-hashing');
const { constants } = require('../util/constants/constants');
const fs = require('fs');
const path = require('path');

class ServiceRegistry{
    registry = {};
    timeResetters = {};
    hashRegistry = {};
    healthyNodes = {};
    saveTimeout = null;

    constructor() {
        this.loadFromFile();
    }

    getRegServers = () => this.registry;

    getNodes = (serviceName) => (this.registry[serviceName] || {})["nodes"];

    getHealthyNodes = (serviceName) => this.healthyNodes[serviceName] || [];

    initHashRegistry = (serviceName) => {
        if(!this.hashRegistry[serviceName]){
            this.hashRegistry[serviceName] = new ConsistentHashing({}, constants.CONSISTENT_HASHING_OPTIONS);
        }
    }

    addToHealthyNodes = (serviceName, nodeName) => {
        if (!this.healthyNodes[serviceName]) {
            this.healthyNodes[serviceName] = [];
        }
        if (!this.healthyNodes[serviceName].includes(nodeName)) {
            this.healthyNodes[serviceName].push(nodeName);
        }
    }

    removeFromHealthyNodes = (serviceName, nodeName) => {
        if (this.healthyNodes[serviceName]) {
            this.healthyNodes[serviceName] = this.healthyNodes[serviceName].filter(n => n !== nodeName);
        }
    }

    addNodeToHashRegistry = (serviceName, nodeName) => {
        this.initHashRegistry(serviceName);
        if(Object.values(this.hashRegistry[serviceName]["nodes"]).includes(nodeName)) return;
        this.hashRegistry[serviceName].addNode(nodeName);
        this.debounceSave();
    }

    removeNodeFromRegistry = (serviceName, nodeName) => {
        if (this.hashRegistry[serviceName]) {
            this.hashRegistry[serviceName].removeNode(nodeName);
        }
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
        }, 100); // debounce for 100ms
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
                            if (nodes[nodeName].healthy) {
                                this.addToHealthyNodes(serviceName, nodeName);
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