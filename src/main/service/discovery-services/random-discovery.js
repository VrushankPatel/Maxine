const { serviceRegistry } = require("../../entity/service-registry");

class RandomDiscovery{
    /**
     * retrieve a random node based on the serviceName passed
     * @param {string} serviceName
     * @returns {object}
     */
    getNode = (serviceName) => {
        const nodes = serviceRegistry.getNodes(serviceName) || {};
        const healthyKeys = Object.keys(nodes).filter(key => nodes[key].healthy);
        if (healthyKeys.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * healthyKeys.length);
        return nodes[healthyKeys[randomIndex]];
    }
}

module.exports = {
    RandomDiscovery
}