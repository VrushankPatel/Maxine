const { serviceRegistry } = require("../../entity/service-registry");

class RandomDiscovery{
    /**
     * retrieve a random node based on the serviceName passed
     * @param {string} serviceName
     * @param {string} version
     * @returns {object}
     */
    getNode = (serviceName, version) => {
        const nodes = serviceRegistry.getNodes(serviceName) || {};
        let healthyNodeNames = serviceRegistry.getHealthyNodes(serviceName);
        if (version) {
            healthyNodeNames = healthyNodeNames.filter(nodeName => nodes[nodeName] && nodes[nodeName].version === version);
        }
        if (healthyNodeNames.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * healthyNodeNames.length);
        return nodes[healthyNodeNames[randomIndex]];
    }
}

module.exports = {
    RandomDiscovery
}