const { serviceRegistry } = require("../../entity/service-registry");

class FastestDiscovery {
    constructor() {
        this.fastestCache = new Map(); // serviceName -> {nodeName, timestamp}
        this.cacheTTL = 1000; // 1 second
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

        // If no response times, pick first
        if (!selectedNodeName || minResponseTime === Infinity) {
            selectedNodeName = healthyNodeNames[0];
        }

        // Cache the result
        this.fastestCache.set(fullServiceName, { nodeName: selectedNodeName, timestamp: Date.now() });

        const nodes = serviceRegistry.getNodes(fullServiceName);
        return nodes[selectedNodeName] || null;
    }
}

module.exports = {
    FastestDiscovery
}