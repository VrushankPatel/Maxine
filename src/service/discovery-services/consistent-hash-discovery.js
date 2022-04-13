const { serviceRegistry } = require("../../entity/service-registry");
const _ = require('lodash');

class ConsistentHashDiscovery{
    getNodeByConsistentHashing = (serviceName, ip) => {
        const serviceNodesObj = serviceRegistry.getNodes(serviceName);
        const cons = serviceRegistry.hashRegistry[serviceName];
        if(_.isEmpty(cons)) return {};
        const nodeName = cons.getNode(ip);
        return serviceNodesObj[nodeName];
    }
}

module.exports = {
    ConsistentHashDiscovery
}