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
    getNode = (fullServiceName, ip) => {
        const serviceNodesObj = serviceRegistry.getNodes(fullServiceName);
        const cons = serviceRegistry.hashRegistry[fullServiceName];
        if(_.isEmpty(cons) || _.isEmpty(cons.nodes)) return null;
        const nodeName = cons.getNode(ip);
        const node = serviceNodesObj[nodeName];
        return node && serviceRegistry.getHealthyNodes(fullServiceName).includes(nodeName) ? node : null;
    }
}

module.exports = {
    ConsistentHashDiscovery
}