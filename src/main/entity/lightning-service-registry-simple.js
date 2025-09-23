// Lightning-fast service registry for minimal overhead in lightning mode
const config = require('../config/config');
const HashRing = require('hashring');

// Fast LCG PRNG for random load balancing
let lcgSeed = Date.now();
const lcgA = 1664525;
const lcgC = 1013904223;
const lcgM = 4294967296;

const fastRandom = () => {
    lcgSeed = (lcgA * lcgSeed + lcgC) % lcgM;
    return lcgSeed / lcgM;
};

class LightningServiceRegistrySimple {
    constructor() {
        this.services = new Map(); // serviceName -> { nodes: Map<nodeName, node>, healthyNodesArray: [], roundRobinIndex: 0 }
        this.lastHeartbeats = new Map(); // nodeName -> timestamp
        this.nodeToService = new Map(); // nodeName -> serviceName
        this.heartbeatTimeout = 30000; // 30 seconds

        // Cached counts for performance
        this.servicesCount = 0;
        this.nodesCount = 0;

        // Periodic cleanup
        setInterval(() => this.cleanup(), 30000);
    }

    register(serviceName, nodeInfo) {
        const nodeName = `${nodeInfo.host}:${nodeInfo.port}`;
        const weight = nodeInfo.metadata && nodeInfo.metadata.weight ? parseInt(nodeInfo.metadata.weight) : 1;
        const node = { ...nodeInfo, nodeName, address: `${nodeInfo.host}:${nodeInfo.port}`, weight, connections: 0 };

        if (!this.services.has(serviceName)) {
            this.services.set(serviceName, { nodes: new Map(), healthyNodesArray: [], roundRobinIndex: 0 });
            this.servicesCount++;
        }
        const service = this.services.get(serviceName);
        if (service.nodes.has(nodeName)) {
            // Already registered, just update heartbeat
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
            return true;
        }
        return false;
    }

    getRandomNode(serviceName, strategy = 'round-robin', clientIP = null) {
        const service = this.services.get(serviceName);
        if (!service || service.healthyNodesArray.length === 0) return null;

        let selectedNode;
        switch (strategy) {
            case 'random':
                const randomIndex = (fastRandom() * service.healthyNodesArray.length) | 0;
                selectedNode = service.healthyNodesArray[randomIndex];
                break;
            case 'weighted-random':
                selectedNode = this.selectWeightedRandom(service.healthyNodesArray);
                break;
            case 'least-connections':
                selectedNode = this.selectLeastConnections(service.healthyNodesArray);
                break;
            case 'consistent-hash':
                selectedNode = this.selectConsistentHash(service.healthyNodesArray, clientIP || 'default');
                break;
            case 'ip-hash':
                selectedNode = this.selectIPHash(service.healthyNodesArray, clientIP);
                break;
            default: // round-robin
                let index = service.roundRobinIndex || 0;
                selectedNode = service.healthyNodesArray[index];
                service.roundRobinIndex = (index + 1) % service.healthyNodesArray.length;
        }
        if (selectedNode) {
            selectedNode.connections++; // Increment for least-connections
        }
        return selectedNode;
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

    cleanup() {
        const now = Date.now();
        const toRemove = [];
        for (const [nodeName, timestamp] of this.lastHeartbeats) {
            if (now - timestamp > this.heartbeatTimeout) {
                toRemove.push(nodeName);
            }
        }
        for (const nodeName of toRemove) {
            this.lastHeartbeats.delete(nodeName);
            const serviceName = this.nodeToService.get(nodeName);
            if (serviceName) {
                const service = this.services.get(serviceName);
                if (service) {
                    // Remove from healthyNodesArray
                    const index = service.healthyNodesArray.findIndex(n => n.nodeName === nodeName);
                    if (index !== -1) {
                        service.healthyNodesArray.splice(index, 1);
                        if (service.roundRobinIndex >= service.healthyNodesArray.length) {
                            service.roundRobinIndex = 0;
                        }
                        this.nodesCount--;
                    }
                    service.nodes.delete(nodeName);
                    if (service.nodes.size === 0) {
                        this.services.delete(serviceName);
                        this.servicesCount--;
                    }
                }
            }
            this.nodeToService.delete(nodeName);
        }
    }

    getServices() {
        return Array.from(this.services.keys());
    }
}

module.exports = { LightningServiceRegistrySimple };