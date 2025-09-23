const { serviceRegistry } = require("../../entity/service-registry");

class LeastResponseTimeDiscovery {
    constructor() {
        this.fastestCache = new Map(); // serviceName -> {nodeName, timestamp}
        this.cacheTTL = 1000; // 1 second
        this.offsets = new Map();
    }

    invalidateCache = (fullServiceName) => {
        this.fastestCache.delete(fullServiceName);
    }

    /**
      * Retrieve the node with the lowest average response time
      * @param {string} serviceName
      * @param {string} group
      * @returns {object}
      */
    getNode = (fullServiceName, group) => {
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName, group);
        if (healthyNodes.length === 0) return null;

        // Check cache
        const cached = this.fastestCache.get(fullServiceName);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
            return cached.node;
        }

        let selectedNode = null;
        let minResponseTime = Infinity;

        for (const node of healthyNodes) {
            const avgResponseTime = serviceRegistry.getAverageResponseTime(fullServiceName, node.nodeName);
            if (avgResponseTime < minResponseTime) {
                minResponseTime = avgResponseTime;
                selectedNode = node;
            }
        }

        // If no response times recorded, fall back to round-robin
        if (!selectedNode || minResponseTime === Infinity) {
            const offset = this.getOffsetAndIncrement(fullServiceName);
            selectedNode = healthyNodes[offset % healthyNodes.length];
        }

        // Cache the result
        this.fastestCache.set(fullServiceName, { node: selectedNode, timestamp: Date.now() });

        return selectedNode;
    }

    /**
      * Increment offset for fallback
      * @param {string} serviceName
      * @returns {number}
      */
    getOffsetAndIncrement = (fullServiceName) => {
        if (!this.offsets.has(fullServiceName)) {
            this.offsets.set(fullServiceName, 0);
        }
        const currentOffset = this.offsets.get(fullServiceName);
        this.offsets.set(fullServiceName, currentOffset + 1);
        return currentOffset;
    }
}

module.exports = {
    LeastResponseTimeDiscovery
}