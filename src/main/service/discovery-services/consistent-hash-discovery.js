const { serviceRegistry } = require("../../entity/service-registry");

class ConsistentHashDiscovery{
    /**
     * Use consistent hashing ring to return the appropriate Node based on IP.
     * @param {string} serviceName
     * @param {string} ip
     * @param {string} version
     * @returns {object}
     */
    getNode = (fullServiceName, ip) => {
        const ring = serviceRegistry.hashRegistry[fullServiceName];
        if (!ring) return null;
        const nodeName = ring.get(ip);
        const nodes = serviceRegistry.getNodes(fullServiceName);
        return nodes ? nodes[nodeName] : null;
    }
}

module.exports = {
    ConsistentHashDiscovery
}