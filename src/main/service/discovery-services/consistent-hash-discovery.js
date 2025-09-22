const { serviceRegistry } = require("../../entity/service-registry");
const _ = require('lodash');

class ConsistentHashDiscovery{
    /**
     * Use HashRegistry and returns the appropriate Node based on hashing the IP.
     * @param {string} serviceName
     * @param {string} ip
     * @param {string} version
     * @returns {object}
     */
    getNode = (serviceName, ip, version) => {
        const serviceNodesObj = serviceRegistry.getNodes(serviceName);
        const cons = serviceRegistry.hashRegistry[serviceName];
        if(_.isEmpty(cons) || _.isEmpty(cons.nodes)) return null;
        let nodeName = cons.getNode(ip);
        let node = serviceNodesObj[nodeName];
        if (version && node && node.version !== version) {
            // If version doesn't match, try to find another node with version
            const healthyNodes = serviceRegistry.getHealthyNodes(serviceName).filter(n => serviceNodesObj[n] && serviceNodesObj[n].version === version);
            if (healthyNodes.length > 0) {
                nodeName = healthyNodes[0]; // simple fallback
                node = serviceNodesObj[nodeName];
            } else {
                return null;
            }
        }
        return node && serviceRegistry.getHealthyNodes(serviceName).includes(nodeName) ? node : null;
    }
}

module.exports = {
    ConsistentHashDiscovery
}