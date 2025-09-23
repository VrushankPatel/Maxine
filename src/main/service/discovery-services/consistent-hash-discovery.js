const { serviceRegistry } = require("../../entity/service-registry");

class ConsistentHashDiscovery{
    /**
      * Use consistent hashing to return the appropriate Node based on IP.
      * @param {string} serviceName
      * @param {string} ip
      * @param {string} version
      * @returns {object}
      */
    getNode = (fullServiceName, ip) => {
        const hashRing = serviceRegistry.hashRegistry.get(fullServiceName);
        if (!hashRing || hashRing.servers.length === 0) return null;
        const nodeName = hashRing.get(ip);
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName);
        return healthyNodes.find(node => node.nodeName === nodeName) || null;
    }

    invalidateCache = (fullServiceName) => {
        // Uses serviceRegistry hashRegistry, invalidated there
    }
}

module.exports = {
    ConsistentHashDiscovery
}