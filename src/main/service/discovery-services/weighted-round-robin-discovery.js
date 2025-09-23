const { serviceRegistry } = require("../../entity/service-registry");

class WeightedRoundRobinDiscovery {
    /**
     * Retrieve the node based on the serviceName passed, using weighted round-robin algorithm
     * @param {string} serviceName
     * @param {string} version
     * @returns {object}
     */
    getNode = (fullServiceName) => {
        const healthy = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthy.length === 0) return null;

        const offset = this.getOffsetAndIncrement(fullServiceName);
        const nodes = serviceRegistry.getNodes(fullServiceName);
        let totalWeight = 0;
        for (const nodeName of healthy) {
            const node = nodes[nodeName];
            if (node) {
                totalWeight += parseInt(node.weight) || 1;
            }
        }
        if (totalWeight === 0) return null;

        let currentWeight = 0;
        const position = offset % totalWeight;
        for (const nodeName of healthy) {
            const node = nodes[nodeName];
            if (node) {
                currentWeight += parseInt(node.weight) || 1;
                if (position < currentWeight) {
                    return nodeName;
                }
            }
        }
        // fallback
        return healthy[0];
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