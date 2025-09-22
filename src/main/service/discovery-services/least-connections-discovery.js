const { serviceRegistry } = require("../../entity/service-registry");

class LeastConnectionsDiscovery{
    /**
     * Select the node with the least active connections
     * @param {string} serviceName
     * @returns {object}
     */
    getNode = (serviceName) => {
        const nodes = serviceRegistry.getNodes(serviceName) || {};
        const healthyNodeNames = serviceRegistry.getHealthyNodes(serviceName);
        if (healthyNodeNames.length === 0) return null;
        let minConnections = Infinity;
        let selectedNodeName = null;
        for (const nodeName of healthyNodeNames) {
            const connections = serviceRegistry.getActiveConnections(serviceName, nodeName);
            if (connections < minConnections) {
                minConnections = connections;
                selectedNodeName = nodeName;
            }
        }
        return selectedNodeName ? nodes[selectedNodeName] : null;
    }
}

module.exports = {
    LeastConnectionsDiscovery
}