const { serviceRegistry } = require("../../entity/service-registry");

class RoundRobinDiscovery{
    /**
     * retrieve the node based on the serviceName passed and returns the node at the index of offset, also increament the offset by 1 to select very second node next time.
     * @param {string} serviceName
     * @returns {object}
     */
    getNode = (serviceName) => {
        const nodes = serviceRegistry.getNodes(serviceName) || {};
        const offset = this.getOffsetAndIncrement(serviceName) || 0;
        const keys = Object.keys(nodes);
        const key = keys[offset % keys.length];
        return nodes[key];
    }

    /**
     * returns the offset of serviceNode(selected by serviceName) and increment(postincrement) it by 1
     * @param {string} serviceName
     * @returns {number}
     */
    getOffsetAndIncrement = (serviceName) => {
        return (serviceRegistry.registry[serviceName] || {})["offset"]++;
    }
}

module.exports = {
    RoundRobinDiscovery
}