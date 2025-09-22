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
        const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthyNodeNames.length === 0) return null;
        const hash = ip.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        return healthyNodeNames[hash % healthyNodeNames.length];
    }
}

module.exports = {
    ConsistentHashDiscovery
}