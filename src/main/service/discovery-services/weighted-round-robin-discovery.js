const { serviceRegistry } = require("../../entity/service-registry");

class WeightedRoundRobinDiscovery {
    constructor() {
        this.expandedLists = new Map(); // serviceName -> array of nodeNames expanded by weight
        this.offsets = new Map();
    }

    /**
      * Retrieve the node based on the serviceName passed, using weighted round-robin algorithm
      * @param {string} serviceName
      * @param {string} version
      * @returns {object}
      */
    getNode = (fullServiceName) => {
        const healthy = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthy.length === 0) return null;

        // Build expanded list if not cached or changed
        if (!this.expandedLists.has(fullServiceName)) {
            this.buildExpandedList(fullServiceName, healthy);
        }

        const expanded = this.expandedLists.get(fullServiceName);
        if (!expanded || expanded.length === 0) return null;

        const offset = this.getOffsetAndIncrement(fullServiceName);
        const nodeName = expanded[offset % expanded.length];
        const nodes = serviceRegistry.getNodes(fullServiceName);
        return nodes[nodeName] || null;
    }

    buildExpandedList = (fullServiceName, healthy) => {
        const nodes = serviceRegistry.getNodes(fullServiceName);
        const expanded = [];
        for (const nodeName of healthy) {
            const node = nodes[nodeName];
            const weight = parseInt(node?.weight) || 1;
            for (let i = 0; i < weight; i++) {
                expanded.push(nodeName);
            }
        }
        this.expandedLists.set(fullServiceName, expanded);
    }

    invalidateCache = (fullServiceName) => {
        this.expandedLists.delete(fullServiceName);
        this.offsets.delete(fullServiceName);
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