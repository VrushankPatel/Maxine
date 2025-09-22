const { serviceRegistry } = require("../../entity/service-registry");

class RandomDiscovery{
    /**
     * retrieve a random node based on the serviceName passed
     * @param {string} serviceName
     * @returns {object}
     */
    getNode = (serviceName) => {
        const nodes = serviceRegistry.getNodes(serviceName) || {};
        const keys = Object.keys(nodes);
        if (keys.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * keys.length);
        return nodes[keys[randomIndex]];
    }
}

module.exports = {
    RandomDiscovery
}