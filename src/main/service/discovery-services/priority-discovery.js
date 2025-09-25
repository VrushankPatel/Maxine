const { serviceRegistry } = require("../../entity/service-registry");

class PriorityDiscovery{
    /**
      * retrieve the highest priority healthy node based on the serviceName passed
      * @param {string} serviceName
      * @param {string} group
      * @param {array} tags
      * @returns {object}
      */
    getNode = (fullServiceName, group, tags, deployment, filter, advancedFilters) => {
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName, group, tags, deployment, filter, advancedFilters);
        if (healthyNodes.length === 0) return null;
        // Nodes are already sorted by priority descending in getHealthyNodes
        return healthyNodes[0];
    }

    invalidateCache = (fullServiceName) => {
        // No cache
    }
}

module.exports = {
    PriorityDiscovery
}