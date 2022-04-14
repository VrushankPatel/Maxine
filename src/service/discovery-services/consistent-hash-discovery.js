const { serviceRegistry } = require("../../entity/service-registry");
const _ = require('lodash');

class ConsistentHashDiscovery{
    getNode = (serviceName, ip) => {
        const serviceNodesObj = serviceRegistry.getNodes(serviceName);
        const cons = serviceRegistry.hashRegistry[serviceName];
        if(_.isEmpty(cons) || _.isEmpty(cons.nodes)) return {};
        const nodeName = cons.getNode(ip);
        return serviceNodesObj[nodeName];
    }
}

module.exports = {
    ConsistentHashDiscovery
}