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
     * @param {string} version
     * @returns {object}
     */
    getNode = (fullServiceName) => {
        const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthyNodeNames.length === 0) return null;

        // Check cache
        const cached = this.fastestCache.get(fullServiceName);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
            const nodes = serviceRegistry.getNodes(fullServiceName);
            return nodes[cached.nodeName] || null;
        }

        let selectedNodeName = null;
        let minResponseTime = Infinity;

        for (const nodeName of healthyNodeNames) {
            const avgResponseTime = serviceRegistry.getAverageResponseTime(fullServiceName, nodeName);
            if (avgResponseTime < minResponseTime) {
                minResponseTime = avgResponseTime;
                selectedNodeName = nodeName;
            }
        }

        // If no response times recorded, fall back to round-robin
        if (!selectedNodeName || minResponseTime === Infinity) {
            const offset = this.getOffsetAndIncrement(fullServiceName);
            selectedNodeName = healthyNodeNames[offset % healthyNodeNames.length];
        }

        // Cache the result
        this.fastestCache.set(fullServiceName, { nodeName: selectedNodeName, timestamp: Date.now() });

        const nodes = serviceRegistry.getNodes(fullServiceName);
        return nodes[selectedNodeName] || null;
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