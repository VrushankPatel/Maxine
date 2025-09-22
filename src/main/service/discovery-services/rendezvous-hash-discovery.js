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
     * @param {string} version
     * @returns {object} returns the node by calling select method
     */
    getNode = (serviceName, ip, version) => {
        const serviceNodesObj = serviceRegistry.getNodes(serviceName);
        return this.selectNode(serviceNodesObj, ip, serviceName, version) || null;
    }

    /**
     * Selects the node based on hash-digest of IP.
     * @param {object} nodes
     * @param {string} ip
     * @param {string} serviceName
     * @param {string} version
     * @returns {object} select the node based on IP Hashing
     */
    selectNode(nodes, ip, serviceName, version) {
        if(_.isUndefined(nodes)) return null;
        let targetNodeId, targetNodeRank = 0;
        let healthyNodeNames = serviceRegistry.getHealthyNodes(serviceName);
        if (version) {
            healthyNodeNames = healthyNodeNames.filter(nodeName => nodes[nodeName] && nodes[nodeName].version === version);
        }
        for (let nodeId of healthyNodeNames) {
            let nodeRank = this.rank(nodeId, ip);
            if (nodeRank > targetNodeRank) {
                targetNodeId = nodeId;
                targetNodeRank = nodeRank;
            }
        }
        return targetNodeId ? nodes[targetNodeId] : null;
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