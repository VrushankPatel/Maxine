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
    getNode = (fullServiceName, ip) => {
        const serviceNodesObj = serviceRegistry.getNodes(fullServiceName);
        return this.selectNode(serviceNodesObj, ip, fullServiceName) || null;
    }

    /**
     * Selects the node based on hash-digest of IP.
     * @param {object} nodes
     * @param {string} ip
     * @param {string} serviceName
     * @param {string} version
     * @returns {object} select the node based on IP Hashing
     */
    selectNode(nodes, ip, fullServiceName) {
        if(_.isUndefined(nodes)) return null;
        let targetNodeId, targetNodeRank = 0;
        const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName);
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
     * Returns rank by simple hash of nodeId and ip.
     * @param {string} nodeId
     * @param {string} ip
     * @returns {number} return rank by simple hash of nodeId and ip.
     */
    rank = (nodeId, ip) => nodeId.split('').reduce((a, b) => a + b.charCodeAt(0), 0) + ip.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
}

module.exports = {
    RendezvousHashDiscovery
}