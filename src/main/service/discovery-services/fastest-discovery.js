const { serviceRegistry } = require("../../entity/service-registry");

class FastestDiscovery {
    constructor() {
        this.fastestCache = new Map(); // serviceName -> {nodeName, timestamp}
        this.cacheTTL = 5000; // 5 seconds
    }

    /**
      * Retrieve the node with the lowest average response time
      * @param {string} serviceName
      * @param {string} group
      * @param {array} tags
      * @returns {object}
      */
    getNode = (fullServiceName, group, tags, deployment, filter) => {
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName, group, tags, deployment, filter);
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

        // If no response times, pick first
        if (!selectedNode || minResponseTime === Infinity) {
            selectedNode = healthyNodes[0];
        }

        // Cache the result
        this.fastestCache.set(fullServiceName, { node: selectedNode, timestamp: Date.now() });

        return selectedNode;
    }

    invalidateCache = (fullServiceName) => {
        this.fastestCache.delete(fullServiceName);
    }
}

module.exports = {
    FastestDiscovery
}