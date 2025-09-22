const { serviceRegistry } = require("../../entity/service-registry");

class RoundRobinDiscovery{
    constructor() {
        this.offsets = new Map();
    }

    /**
      * retrieve the node based on the serviceName passed and returns the node at the index of offset, also increament the offset by 1 to select very second node next time.
      * @param {string} serviceName
      * @param {string} version
      * @returns {object}
      */
    getNode = (fullServiceName) => {
        const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthyNodeNames.length === 0) return null;
        const offset = this.getOffsetAndIncrement(fullServiceName) || 0;
        return healthyNodeNames[offset % healthyNodeNames.length];
    }

    /**
      * returns the offset of serviceNode(selected by serviceName) and increment(postincrement) it by 1
      * @param {string} serviceName
      * @returns {number}
      */
    getOffsetAndIncrement = (fullServiceName) => {
        if (!this.offsets.has(fullServiceName)) {
            this.offsets.set(fullServiceName, 0);
        }
        const currentOffset = this.offsets.get(fullServiceName);
        this.offsets.set(fullServiceName, currentOffset + 1);
        return currentOffset;
    }
}

module.exports = {
    RoundRobinDiscovery
}