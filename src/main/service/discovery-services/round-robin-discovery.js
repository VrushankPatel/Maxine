const { serviceRegistry } = require("../../entity/service-registry");

class RoundRobinDiscovery{
    /**
     * retrieve the node based on the serviceName passed and returns the node at the index of offset, also increament the offset by 1 to select very second node next time.
     * @param {string} serviceName
     * @returns {object}
     */
    getNode = (serviceName) => {
        const nodes = serviceRegistry.getNodes(serviceName) || {};
        const healthyNodeNames = serviceRegistry.getHealthyNodes(serviceName);
        if (healthyNodeNames.length === 0) return null;
        const offset = this.getOffsetAndIncrement(serviceName) || 0;
        const key = healthyNodeNames[offset % healthyNodeNames.length];
        return nodes[key];
    }

    /**
     * returns the offset of serviceNode(selected by serviceName) and increment(postincrement) it by 1
     * @param {string} serviceName
     * @returns {number}
     */
    getOffsetAndIncrement = (serviceName) => {
        const service = serviceRegistry.registry[serviceName];
        if (!service) return 0;
        const currentOffset = service.offset || 0;
        service.offset = currentOffset + 1;
        return currentOffset;
    }
}

module.exports = {
    RoundRobinDiscovery
}