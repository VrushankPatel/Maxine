const { serviceRegistry } = require("../../entity/service-registry");

class RandomDiscovery{
    /**
      * retrieve a random node based on the serviceName passed
      * @param {string} serviceName
      * @param {string} group
      * @param {array} tags
      * @returns {object}
      */
    getNode = (fullServiceName, group, tags) => {
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName, group, tags);
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