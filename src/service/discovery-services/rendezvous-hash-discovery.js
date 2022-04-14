const { serviceRegistry } = require("../../entity/service-registry");
const _ = require('lodash');
const crypto = require('crypto');
const { constants } = require("../../util/constants/constants");
const separator = Buffer.from('\0');

class RendezvousHashDiscovery{
    /**
     * Calls Select method and returns node retrieved from select method.
     * @param {string} serviceName
     * @param {string} ip
     * @returns {object} returns the node by calling select method
     */
    getNode = (serviceName, ip) => {
        const serviceNodesObj = serviceRegistry.getNodes(serviceName);
        const node = this.selectNode(serviceNodesObj, ip) || {};
        return node;
    }

    /**
     * Selects the node based on hash-digest of IP.
     * @param {object} nodes
     * @param {string} ip
     * @returns {object} select the node based on IP Hashing
     */
    selectNode(nodes, ip) {
        if(_.isUndefined(nodes)) return {};
        let targetNodeId, targetNodeRank = 0;
        for (let nodeId in nodes) if ({}.hasOwnProperty.call(nodes, nodeId)) {
            let nodeRank = this.rank(nodeId, ip);
            if (nodeRank > targetNodeRank) {
                targetNodeId = nodeId;
                targetNodeRank = nodeRank;
            }
        }
        return nodes[targetNodeId];
    }

    /**
     * Returns rank by hashing nodeId and ip with hash algo defined in constants.
     * @param {string} nodeId
     * @param {string} ip
     * @returns {number} return rank by hashing nodeId and ip with hash algo defined in constants.
     */
    rank = (nodeId, ip)  => crypto
                                .createHash(constants.RENDEZVOUS_HASH_ALGO)
                                .update(nodeId)
                                .update(separator)
                                .update(ip)
                                .digest()
                                .readUInt32LE(0, true);
}

module.exports = {
    RendezvousHashDiscovery
}