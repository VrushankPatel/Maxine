const { serviceRegistry } = require("../../entity/service-registry");

class RoundRobinDiscovery{
    getNode = (serviceName) => {
        const nodes = serviceRegistry.getNodes(serviceName) || {};
        const offset = this.getOffsetAndIncrement(serviceName) || 0;
        const keys = Object.keys(nodes);
        const key = keys[offset % keys.length];
        return nodes[key];
    }

    getOffsetAndIncrement = (serviceName) => {
        return (serviceRegistry.registry[serviceName] || {})["offset"]++;
    }
}

module.exports = {
    RoundRobinDiscovery
}