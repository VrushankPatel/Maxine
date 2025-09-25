const { serviceRegistry } = require("../../entity/service-registry");

class LeastResponseTimeDiscovery {
    constructor() {
        this.fastestCache = new Map(); // serviceName -> {nodeName, timestamp}
        this.cacheTTL = 5000; // 5 seconds
        this.offsets = new Map();
    }

    invalidateCache = (fullServiceName) => {
        for (const key of this.fastestCache.keys()) {
            if (key.startsWith(`${fullServiceName}:`)) {
                this.fastestCache.delete(key);
            }
        }
    }

    /**
      * Retrieve the node with the best health score (includes response time and failure rate)
      * @param {string} serviceName
      * @param {string} group
      * @param {array} tags
      * @returns {object}
      */
    getNode = (fullServiceName, group, tags, deployment, filter, advancedFilters) => {
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName, group, tags, deployment, filter, advancedFilters);
        if (healthyNodes.length === 0) return null;

        const cacheKey = `${fullServiceName}:${group || ''}:${tags ? tags.sort().join(',') : ''}`;
        // Check cache
        const cached = this.fastestCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
            return cached.node;
        }

        let selectedNode = null;
        let maxHealthScore = -Infinity;

        for (const node of healthyNodes) {
            const healthScore = serviceRegistry.getHealthScore(fullServiceName, node.nodeName);
            if (healthScore > maxHealthScore) {
                maxHealthScore = healthScore;
                selectedNode = node;
            }
        }

        // If no health scores, fall back to round-robin
        if (!selectedNode || maxHealthScore === -Infinity) {
            const offset = this.getOffsetAndIncrement(fullServiceName);
            selectedNode = healthyNodes[offset % healthyNodes.length];
        }

        // Cache the result
        this.fastestCache.set(cacheKey, { node: selectedNode, timestamp: Date.now() });

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