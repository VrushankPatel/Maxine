const { serviceRegistry } = require("../../entity/service-registry");

class LeastConnectionsDiscovery{
    /**
     * For simplicity, use round-robin as least connections without actual connection tracking
     * @param {string} serviceName
     * @returns {object}
     */
    getNode = (serviceName) => {
        const nodes = serviceRegistry.getNodes(serviceName) || {};
        const keys = Object.keys(nodes);
        if (keys.length === 0) return null;
        // Simple round-robin for now
        const offset = (serviceRegistry.registry[serviceName] || {}).offset || 0;
        serviceRegistry.registry[serviceName].offset = (offset + 1) % keys.length;
        return nodes[keys[offset]];
    }
}

module.exports = {
    LeastConnectionsDiscovery
}