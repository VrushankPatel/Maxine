const { serviceRegistry } = require("../../entity/service-registry");

class LeastConnectionsDiscovery{
    /**
     * For simplicity, use round-robin as least connections without actual connection tracking
     * @param {string} serviceName
     * @returns {object}
     */
    getNode = (serviceName) => {
        const nodes = serviceRegistry.getNodes(serviceName) || {};
        const healthyKeys = Object.keys(nodes).filter(key => nodes[key].healthy);
        if (healthyKeys.length === 0) return null;
        // Simple round-robin for now
        const offset = (serviceRegistry.registry[serviceName] || {}).offset || 0;
        serviceRegistry.registry[serviceName].offset = (offset + 1) % healthyKeys.length;
        return nodes[healthyKeys[offset]];
    }
}

module.exports = {
    LeastConnectionsDiscovery
}