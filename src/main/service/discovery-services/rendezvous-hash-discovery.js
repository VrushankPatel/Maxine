const { serviceRegistry } = require("../../entity/service-registry");
const crypto = require('crypto');
const { constants } = require("../../util/constants/constants");
const separator = Buffer.from('\0');

class RendezvousHashDiscovery{
    constructor() {
        this.cache = new Map(); // key -> {node, timestamp}
        this.cacheTTL = 1000; // 1 second
    }

    /**
      * Calls Select method and returns node retrieved from select method.
      * @param {string} serviceName
      * @param {string} ip
      * @param {string} group
      * @param {array} tags
      * @returns {object} returns the node by calling select method
      */
    getNode = (fullServiceName, ip, group, tags) => {
        const groupKey = group ? `:${group}` : '';
        const tagKey = tags && tags.length > 0 ? `:${tags.sort().join(',')}` : '';
        const cacheKey = `${fullServiceName}:${ip}${groupKey}${tagKey}`;
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
            return cached.node;
        }
        const targetNode = this.selectNode(ip, fullServiceName, group, tags);
        this.cache.set(cacheKey, { node: targetNode, timestamp: Date.now() });
        return targetNode;
    }

    /**
     * Selects the node based on hash-digest of IP.
     * @param {string} ip
     * @param {string} serviceName
     * @param {string} group
     * @param {array} tags
     * @returns {object} select the node based on IP Hashing
     */
    selectNode(ip, fullServiceName, group, tags) {
        let targetNode, targetNodeRank = -1;
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName, group, tags);
        for (let node of healthyNodes) {
            let nodeRank = this.rank(node.nodeName, ip);
            if (nodeRank > targetNodeRank) {
                targetNode = node;
                targetNodeRank = nodeRank;
            }
        }
        return targetNode || null;
    }

    /**
      * Returns rank by hash of nodeId and ip.
      * @param {string} nodeId
      * @param {string} ip
      * @returns {number} return rank by hash of nodeId and ip.
      */
    rank = (nodeId, ip) => this.hashString(nodeId + ip);

    hashString = (str) => {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
        }
        return hash;
    }

    invalidateCache = (fullServiceName) => {
        // Clear cache entries for this service
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${fullServiceName}:`)) {
                this.cache.delete(key);
            }
        }
    }
}

module.exports = {
    RendezvousHashDiscovery
}