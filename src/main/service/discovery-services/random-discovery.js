const { serviceRegistry } = require("../../entity/service-registry");

class RandomDiscovery{
    /**
      * retrieve a random node based on the serviceName passed
      * @param {string} serviceName
      * @param {string} group
      * @returns {object}
      */
    getNode = (fullServiceName, group) => {
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName, group);
        if (healthyNodes.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * healthyNodes.length);
        return healthyNodes[randomIndex];
    }

    invalidateCache = (fullServiceName) => {
        // No cache
    }
}

module.exports = {
    RandomDiscovery
}