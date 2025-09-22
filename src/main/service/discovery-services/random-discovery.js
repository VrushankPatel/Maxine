const { serviceRegistry } = require("../../entity/service-registry");

class RandomDiscovery{
    /**
     * retrieve a random node based on the serviceName passed
     * @param {string} serviceName
     * @param {string} version
     * @returns {object}
     */
    getNode = (fullServiceName) => {
        const nodes = serviceRegistry.getNodes(fullServiceName) || {};
        const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthyNodeNames.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * healthyNodeNames.length);
        return nodes[healthyNodeNames[randomIndex]];
    }
}

module.exports = {
    RandomDiscovery
}