const { serviceRegistry } = require("../../entity/service-registry");

class RandomDiscovery{
    /**
     * retrieve a random node based on the serviceName passed
     * @param {string} serviceName
     * @returns {object}
     */
    getNode = (serviceName) => {
        const nodes = serviceRegistry.getNodes(serviceName) || {};
        const healthyNodeNames = serviceRegistry.getHealthyNodes(serviceName);
        if (healthyNodeNames.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * healthyNodeNames.length);
        return nodes[healthyNodeNames[randomIndex]];
    }
}

module.exports = {
    RandomDiscovery
}