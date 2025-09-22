const { serviceRegistry } = require("../../entity/service-registry");

class ConsistentHashDiscovery{
    /**
     * Use simple hash and returns the appropriate Node based on hashing the IP.
     * @param {string} serviceName
     * @param {string} ip
     * @param {string} version
     * @returns {object}
     */
    getNode = (fullServiceName, ip) => {
        const serviceNodesObj = serviceRegistry.getNodes(fullServiceName);
        const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthyNodeNames.length === 0) return null;
        const sortedNodes = healthyNodeNames.sort();
        const hash = ip.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const index = hash % sortedNodes.length;
        const nodeName = sortedNodes[index];
        const node = serviceNodesObj[nodeName];
        return node;
    }
}

module.exports = {
    ConsistentHashDiscovery
}