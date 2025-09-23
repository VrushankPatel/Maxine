const { serviceRegistry } = require("../../entity/service-registry");

class LeastConnectionsDiscovery{
    /**
     * Select the node with the least active connections
     * @param {string} serviceName
     * @param {string} version
     * @returns {object}
     */
    getNode = (fullServiceName) => {
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthyNodes.length === 0) return null;
        let minConnections = Infinity;
        let selectedNode = null;
        for (const node of healthyNodes) {
            const connections = serviceRegistry.getActiveConnections(fullServiceName, node.nodeName);
            if (connections < minConnections) {
                minConnections = connections;
                selectedNode = node;
            }
        }
        return selectedNode;
    }

    invalidateCache = (fullServiceName) => {
        // No persistent cache
    }
}

module.exports = {
    LeastConnectionsDiscovery
}