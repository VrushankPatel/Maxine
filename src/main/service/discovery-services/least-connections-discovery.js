const { serviceRegistry } = require("../../entity/service-registry");

class LeastConnectionsDiscovery{
    /**
     * Select the node with the least active connections
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