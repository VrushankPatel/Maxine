const { serviceRegistry } = require("../../entity/service-registry");

class PowerOfTwoDiscovery {
    /**
     * Select two random healthy nodes and choose the one with least connections.
     * @param {string} fullServiceName
     * @returns {object}
     */
    getNode = (fullServiceName) => {
        const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthyNodeNames.length === 0) return null;
        if (healthyNodeNames.length === 1) {
            const nodes = serviceRegistry.getNodes(fullServiceName);
            return nodes[healthyNodeNames[0]] || null;
        }

        // Select two random nodes
        const idx1 = Math.floor(Math.random() * healthyNodeNames.length);
        let idx2 = Math.floor(Math.random() * healthyNodeNames.length);
        while (idx2 === idx1) {
            idx2 = Math.floor(Math.random() * healthyNodeNames.length);
        }

        const node1 = healthyNodeNames[idx1];
        const node2 = healthyNodeNames[idx2];

        const conn1 = serviceRegistry.getActiveConnections(fullServiceName, node1);
        const conn2 = serviceRegistry.getActiveConnections(fullServiceName, node2);

        const selectedNodeName = conn1 <= conn2 ? node1 : node2;
        const nodes = serviceRegistry.getNodes(fullServiceName);
        return nodes[selectedNodeName] || null;
    }
}

module.exports = {
    PowerOfTwoDiscovery
}