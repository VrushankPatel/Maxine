const { serviceRegistry } = require("../../entity/service-registry");

// Fast LCG PRNG
let lcgSeed = Date.now();
const lcgA = 1664525;
const lcgC = 1013904223;
const lcgM = 4294967296;

const fastRandom = () => {
    lcgSeed = (lcgA * lcgSeed + lcgC) % lcgM;
    return lcgSeed / lcgM;
};

class PowerOfTwoDiscovery {
    /**
      * Select two random healthy nodes and choose the one with least connections.
      * @param {string} fullServiceName
      * @param {string} group
      * @param {array} tags
      * @returns {object}
      */
    getNode = (fullServiceName, group, tags, deployment, filter) => {
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName, group, tags, deployment, filter);
        if (healthyNodes.length === 0) return null;
        if (healthyNodes.length === 1) {
            return healthyNodes[0];
        }

        // Select two random nodes
        const idx1 = (fastRandom() * healthyNodes.length) | 0;
        let idx2 = (fastRandom() * healthyNodes.length) | 0;
        while (idx2 === idx1) {
            idx2 = (fastRandom() * healthyNodes.length) | 0;
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