const { serviceRegistry } = require("../../entity/service-registry");
const crypto = require('crypto');
const { constants } = require("../../util/constants/constants");
const separator = Buffer.from('\0');

class RendezvousHashDiscovery{
    /**
      * Calls Select method and returns node retrieved from select method.
      * @param {string} serviceName
      * @param {string} ip
      * @param {string} version
      * @returns {object} returns the node by calling select method
      */
    getNode = (fullServiceName, ip) => {
        const targetNodeId = this.selectNode(ip, fullServiceName);
        if (!targetNodeId) return null;
        const nodes = serviceRegistry.getNodes(fullServiceName);
        return nodes[targetNodeId];
    }

    /**
     * Selects the node based on hash-digest of IP.
     * @param {object} nodes
     * @param {string} ip
     * @param {string} serviceName
     * @param {string} version
     * @returns {object} select the node based on IP Hashing
     */
    selectNode(ip, fullServiceName) {
        let targetNodeId, targetNodeRank = -1;
        const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName);
        for (let nodeId of healthyNodeNames) {
            let nodeRank = this.rank(nodeId, ip);
            if (nodeRank > targetNodeRank) {
                targetNodeId = nodeId;
                targetNodeRank = nodeRank;
            }
        }
        return targetNodeId || null;
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
}

module.exports = {
    RendezvousHashDiscovery
}