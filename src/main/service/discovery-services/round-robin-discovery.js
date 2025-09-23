const { serviceRegistry } = require("../../entity/service-registry");

class RoundRobinDiscovery{
    constructor() {
        this.offsets = new Map();
    }

    /**
      * retrieve the node based on the serviceName passed and returns the node at the index of offset, also increament the offset by 1 to select very second node next time.
      * @param {string} serviceName
      * @param {string} group
      * @param {array} tags
      * @returns {object}
      */
    getNode = (fullServiceName, group, tags, deployment) => {
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName, group, tags, deployment);
        if (healthyNodes.length === 0) return null;
        const offset = this.getOffsetAndIncrement(fullServiceName) || 0;
        return healthyNodes[offset % healthyNodes.length];
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

    invalidateCache = (fullServiceName) => {
        this.offsets.delete(fullServiceName);
    }
}

module.exports = {
    RoundRobinDiscovery
}