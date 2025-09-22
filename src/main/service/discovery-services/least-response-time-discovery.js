const { serviceRegistry } = require("../../entity/service-registry");

class LeastResponseTimeDiscovery {
    /**
     * Retrieve the node with the lowest average response time
     * @param {string} serviceName
     * @param {string} version
     * @returns {object}
     */
    getNode = (fullServiceName) => {
        const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthyNodeNames.length === 0) return null;

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

        return selectedNodeName;
    }

    /**
     * Increment offset for fallback
     * @param {string} serviceName
     * @returns {number}
     */
    getOffsetAndIncrement = (fullServiceName) => {
        const service = serviceRegistry.registry[fullServiceName];
        if (!service) return 0;
        const currentOffset = service.offset || 0;
        service.offset = currentOffset + 1;
        return currentOffset;
    }
}

module.exports = {
    LeastResponseTimeDiscovery
}