const { serviceRegistry } = require("../../entity/service-registry");
const _ = require('lodash');
const crypto = require('crypto');
const { constants } = require("../../util/constants/constants");
const separator = Buffer.from('\0');

class RendezvousHashDiscovery{
    getNode = (serviceName, ip) => {
        const serviceNodesObj = serviceRegistry.getNodes(serviceName);
        return this.selectNode(serviceNodesObj, ip) || {};
    }

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