const { serviceRegistry } = require("../../entity/service-registry");

class LeastResponseTimeDiscovery {
    /**
     * Retrieve the node with the lowest average response time
     * @param {string} serviceName
     * @returns {object}
     */
    getNode = (serviceName) => {
        const nodes = serviceRegistry.getNodes(serviceName) || {};
        const healthyNodeNames = serviceRegistry.getHealthyNodes(serviceName);
        if (healthyNodeNames.length === 0) return null;

        let selectedNode = null;
        let minResponseTime = Infinity;

        for (const nodeName of healthyNodeNames) {
            const node = nodes[nodeName];
            if (node) {
                const avgResponseTime = serviceRegistry.getAverageResponseTime(serviceName, nodeName);
                if (avgResponseTime < minResponseTime) {
                    minResponseTime = avgResponseTime;
                    selectedNode = node;
                }
            }
        }

        // If no response times recorded, fall back to round-robin
        if (!selectedNode || minResponseTime === Infinity) {
            const offset = this.getOffsetAndIncrement(serviceName);
            const key = healthyNodeNames[offset % healthyNodeNames.length];
            selectedNode = nodes[key];
        }

        return selectedNode;
    }

    /**
     * Increment offset for fallback
     * @param {string} serviceName
     * @returns {number}
     */
    getOffsetAndIncrement = (serviceName) => {
        const service = serviceRegistry.registry[serviceName];
        if (!service) return 0;
        const currentOffset = service.offset || 0;
        service.offset = currentOffset + 1;
        return currentOffset;
    }
}

module.exports = {
    LeastResponseTimeDiscovery
}