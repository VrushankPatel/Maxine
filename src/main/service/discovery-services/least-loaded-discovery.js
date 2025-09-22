const { serviceRegistry } = require("../../entity/service-registry");

class LeastLoadedDiscovery{
    /**
     * Retrieve the node with the least active connections for the given serviceName
     * @param {string} serviceName
     * @param {string} version
     * @returns {object}
     */
    getNode = (serviceName, version) => {
        const nodes = serviceRegistry.getNodes(serviceName) || {};
        let healthyNodeNames = serviceRegistry.getHealthyNodes(serviceName);
        if (version) {
            healthyNodeNames = healthyNodeNames.filter(nodeName => nodes[nodeName] && nodes[nodeName].version === version);
        }
        if (healthyNodeNames.length === 0) return null;

        let minConnections = Infinity;
        let selectedNode = null;

        for (const nodeName of healthyNodeNames) {
            const connections = serviceRegistry.getActiveConnections(serviceName, nodeName);
            if (connections < minConnections) {
                minConnections = connections;
                selectedNode = nodes[nodeName];
            }
        }

        return selectedNode;
    }
}

module.exports = {
    LeastLoadedDiscovery
}