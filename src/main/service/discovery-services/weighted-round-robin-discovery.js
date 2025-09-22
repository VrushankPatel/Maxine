const { serviceRegistry } = require("../../entity/service-registry");

class WeightedRoundRobinDiscovery {
    /**
     * Retrieve the node based on the serviceName passed, using weighted round-robin algorithm
     * @param {string} serviceName
     * @returns {object}
     */
    getNode = (serviceName) => {
        const nodes = serviceRegistry.getNodes(serviceName) || {};
        const healthyNodeNames = serviceRegistry.getHealthyNodes(serviceName);
        if (healthyNodeNames.length === 0) return null;

        const currentWeight = this.getCurrentWeight(serviceName);
        let selectedNode = null;
        let maxWeight = 0;

        for (const nodeName of healthyNodeNames) {
            const node = nodes[nodeName];
            if (node && node.metadata && node.metadata.weight) {
                const weight = parseInt(node.metadata.weight) || 1;
                if (weight > maxWeight) {
                    maxWeight = weight;
                    selectedNode = node;
                }
            }
        }

        // If no weights, fall back to regular RR
        if (!selectedNode) {
            const offset = this.getOffsetAndIncrement(serviceName);
            const key = healthyNodeNames[offset % healthyNodeNames.length];
            selectedNode = nodes[key];
        }

        return selectedNode;
    }

    /**
     * Get current weight for weighted selection (simplified version)
     * @param {string} serviceName
     * @returns {number}
     */
    getCurrentWeight = (serviceName) => {
        const service = serviceRegistry.registry[serviceName];
        if (!service) return 0;
        return service.currentWeight || 0;
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
    WeightedRoundRobinDiscovery
}