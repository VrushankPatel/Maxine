const { serviceRegistry } = require("../../entity/service-registry");

class ConsistentHashDiscovery{
    /**
      * Use consistent hashing to return the appropriate Node based on IP.
      * @param {string} serviceName
      * @param {string} ip
      * @param {string} group
      * @param {array} tags
      * @returns {object}
      */
    getNode = (fullServiceName, ip, group, tags, deployment) => {
        const hashRing = serviceRegistry.hashRegistry.get(fullServiceName);
        if (!hashRing || hashRing.servers.length === 0) return null;
        const nodeName = hashRing.get(ip);
        // First check if node is in healthyNodesMap for O(1) lookup
        const healthyMap = serviceRegistry.healthyNodesMap.get(fullServiceName);
        if (healthyMap && healthyMap.has(nodeName)) {
            const node = healthyMap.get(nodeName);
            // Check group, tags, and deployment
            if (group && node.metadata.group !== group) return null;
            if (tags && tags.length > 0 && (!node.metadata.tags || !tags.every(tag => node.metadata.tags.includes(tag)))) return null;
            if (deployment && node.metadata.deployment !== deployment) return null;
            return node;
        }
        return null;
    }

    invalidateCache = (fullServiceName) => {
        // Uses serviceRegistry hashRegistry, invalidated there
    }
}

module.exports = {
    ConsistentHashDiscovery
}