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
        const targetNode = this.selectNode(ip, fullServiceName);
        return targetNode;
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
        let targetNode, targetNodeRank = -1;
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName);
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
        // Uses serviceRegistry hashRegistry, invalidated there
    }
}

module.exports = {
    RendezvousHashDiscovery
}