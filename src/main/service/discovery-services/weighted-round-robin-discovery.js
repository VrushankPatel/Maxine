const { serviceRegistry } = require("../../entity/service-registry");

class WeightedRoundRobinDiscovery {
    constructor() {
        this.expandedLists = new Map(); // serviceName -> array of nodeNames expanded by weight
        this.offsets = new Map();
    }

    /**
      * Retrieve the node based on the serviceName passed, using weighted round-robin algorithm
      * @param {string} serviceName
      * @param {string} group
      * @param {array} tags
      * @returns {object}
      */
    getNode = (fullServiceName, group, tags, deployment, filter) => {
        const healthy = serviceRegistry.getHealthyNodes(fullServiceName, group, tags, deployment, filter);
        if (healthy.length === 0) return null;

        // Build expanded list if not cached or changed
        const cacheKey = `${fullServiceName}:${deployment || ''}`;
        if (!this.expandedLists.has(cacheKey)) {
            this.buildExpandedList(cacheKey, healthy);
        }

        const expanded = this.expandedLists.get(cacheKey);
        if (!expanded || expanded.length === 0) return null;

        const offset = this.getOffsetAndIncrement(cacheKey);
        return expanded[offset % expanded.length];
    }

    buildExpandedList = (fullServiceName, healthy) => {
        const expanded = [];
        for (const node of healthy) {
            const weight = parseInt(node.metadata?.weight) || 1;
            for (let i = 0; i < weight; i++) {
                expanded.push(node);
            }
        }
        this.expandedLists.set(fullServiceName, expanded);
    }

    invalidateCache = (fullServiceName) => {
        // Delete all keys starting with fullServiceName
        for (const key of this.expandedLists.keys()) {
            if (key.startsWith(fullServiceName)) {
                this.expandedLists.delete(key);
                this.offsets.delete(key);
            }
        }
    }

    /**
      * Increment offset
      * @param {string} fullServiceName
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
    WeightedRoundRobinDiscovery
}