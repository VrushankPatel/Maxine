const { serviceRegistry } = require("../../entity/service-registry");
const _ = require('lodash');

class ConsistentHashDiscovery{
    /**
     * Use HashRegistry and returns the appropriate Node based on hashing the IP.
     * @param {string} serviceName
     * @param {string} ip
     * @returns {object}
     */
    getNode = (serviceName, ip) => {
        const serviceNodesObj = serviceRegistry.getNodes(serviceName);
        const cons = serviceRegistry.hashRegistry[serviceName];
        if(_.isEmpty(cons) || _.isEmpty(cons.nodes)) return null;
        const nodeName = cons.getNode(ip);
        const node = serviceNodesObj[nodeName];
        return node && serviceRegistry.getHealthyNodes(serviceName).includes(nodeName) ? node : null;
    }
}

module.exports = {
    ConsistentHashDiscovery
}