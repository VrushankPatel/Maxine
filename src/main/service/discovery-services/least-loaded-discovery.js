const { serviceRegistry } = require("../../entity/service-registry");

class LeastLoadedDiscovery{
    /**
     * Retrieve the node with the least active connections for the given serviceName
     * @param {string} serviceName
     * @param {string} version
     * @returns {object}
     */
    getNode = (fullServiceName) => {
        const nodes = serviceRegistry.getNodes(fullServiceName) || {};
        const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthyNodeNames.length === 0) return null;

        let minConnections = Infinity;
        let selectedNode = null;

        for (const nodeName of healthyNodeNames) {
            const connections = serviceRegistry.getActiveConnections(fullServiceName, nodeName);
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