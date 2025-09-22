const { serviceRegistry } = require("../../entity/service-registry");

class WeightedRoundRobinDiscovery {
    /**
     * Retrieve the node based on the serviceName passed, using weighted round-robin algorithm
     * @param {string} serviceName
     * @param {string} version
     * @returns {object}
     */
    getNode = (fullServiceName) => {
        const nodes = serviceRegistry.getNodes(fullServiceName) || {};
        const expanded = serviceRegistry.expandedHealthy.get(fullServiceName) || [];
        if (expanded.length === 0) return null;

        const offset = this.getOffsetAndIncrement(fullServiceName);
        const nodeName = expanded[offset % expanded.length];
        return nodes[nodeName];
    }

    /**
     * Get current weight for weighted selection (simplified version)
     * @param {string} serviceName
     * @returns {number}
     */
    getCurrentWeight = (fullServiceName) => {
        const service = serviceRegistry.registry[fullServiceName];
        if (!service) return 0;
        return service.currentWeight || 0;
    }

    /**
     * Increment offset for fallback
     * @param {string} fullServiceName
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
    WeightedRoundRobinDiscovery
}