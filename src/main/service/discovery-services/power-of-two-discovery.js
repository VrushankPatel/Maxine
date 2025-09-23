const { serviceRegistry } = require("../../entity/service-registry");

class PowerOfTwoDiscovery {
    /**
     * Select two random healthy nodes and choose the one with least connections.
     * @param {string} fullServiceName
     * @returns {object}
     */
    getNode = (fullServiceName) => {
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthyNodes.length === 0) return null;
        if (healthyNodes.length === 1) {
            return healthyNodes[0];
        }

        // Select two random nodes
        const idx1 = Math.floor(Math.random() * healthyNodes.length);
        let idx2 = Math.floor(Math.random() * healthyNodes.length);
        while (idx2 === idx1) {
            idx2 = Math.floor(Math.random() * healthyNodes.length);
        }

        const node1 = healthyNodes[idx1];
        const node2 = healthyNodes[idx2];

        const conn1 = serviceRegistry.getActiveConnections(fullServiceName, node1.nodeName);
        const conn2 = serviceRegistry.getActiveConnections(fullServiceName, node2.nodeName);

        return conn1 <= conn2 ? node1 : node2;
    }

    invalidateCache = (fullServiceName) => {
        // No cache
    }
}

module.exports = {
    PowerOfTwoDiscovery
}