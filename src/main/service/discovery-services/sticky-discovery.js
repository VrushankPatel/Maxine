const { serviceRegistry } = require("../../entity/service-registry");

class StickyDiscovery {
    constructor() {
        this.clientNodeMap = new Map(); // clientIP -> nodeName
    }

    /**
     * Get node for client, stick to the same node if possible, else round robin
     * @param {string} serviceName
     * @param {string} ip
     * @param {string} group
     * @param {array} tags
     * @returns {object}
     */
    getNode = (fullServiceName, ip, group, tags) => {
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName, group, tags);
        if (healthyNodes.length === 0) return null;

        const tagKey = tags && tags.length > 0 ? `:${tags.sort().join(',')}` : '';
        const clientKey = `${fullServiceName}:${ip}${tagKey}`;
        let assignedNode = this.clientNodeMap.get(clientKey);

        if (assignedNode && healthyNodes.some(node => node.nodeName === assignedNode.nodeName)) {
            return assignedNode;
        }

        // Assign new node using round robin
        const offset = this.getOffsetAndIncrement(fullServiceName) || 0;
        const node = healthyNodes[offset % healthyNodes.length];
        this.clientNodeMap.set(clientKey, node);
        return node;
    }

    getOffsetAndIncrement = (fullServiceName) => {
        if (!this.offsets) this.offsets = new Map();
        if (!this.offsets.has(fullServiceName)) {
            this.offsets.set(fullServiceName, 0);
        }
        const currentOffset = this.offsets.get(fullServiceName);
        this.offsets.set(fullServiceName, currentOffset + 1);
        return currentOffset;
    }

    invalidateCache = (fullServiceName) => {
        // Remove mappings for this service
        for (const [key, node] of this.clientNodeMap) {
            if (key.startsWith(`${fullServiceName}:`)) {
                this.clientNodeMap.delete(key);
            }
        }
        if (this.offsets) this.offsets.delete(fullServiceName);
    }
}

module.exports = {
    StickyDiscovery
};