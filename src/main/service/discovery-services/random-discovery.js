const { serviceRegistry } = require("../../entity/service-registry");

class RandomDiscovery{
    /**
     * retrieve a random node based on the serviceName passed
     * @param {string} serviceName
     * @param {string} version
     * @returns {object}
     */
    getNode = (fullServiceName) => {
        const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthyNodeNames.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * healthyNodeNames.length);
        const nodeName = healthyNodeNames[randomIndex];
        const nodes = serviceRegistry.getNodes(fullServiceName);
        return nodes[nodeName] || null;
    }
}

module.exports = {
    RandomDiscovery
}