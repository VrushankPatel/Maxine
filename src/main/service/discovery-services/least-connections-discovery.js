const { serviceRegistry } = require("../../entity/service-registry");

class LeastConnectionsDiscovery{
    /**
     * For simplicity, use round-robin as least connections without actual connection tracking
     * @param {string} serviceName
     * @returns {object}
     */
    getNode = (serviceName) => {
        const nodes = serviceRegistry.getNodes(serviceName) || {};
        const healthyNodeNames = serviceRegistry.getHealthyNodes(serviceName);
        if (healthyNodeNames.length === 0) return null;
        // Simple round-robin for now
        const offset = (serviceRegistry.registry[serviceName] || {}).offset || 0;
        serviceRegistry.registry[serviceName].offset = (offset + 1) % healthyNodeNames.length;
        return nodes[healthyNodeNames[offset]];
    }
}

module.exports = {
    LeastConnectionsDiscovery
}