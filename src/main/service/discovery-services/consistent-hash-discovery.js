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
        const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthyNodeNames.length === 0) return null;
        const hash = this.hashString(ip);
        return healthyNodeNames[Math.abs(hash) % healthyNodeNames.length];
    }

    hashString = (str) => {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
        }
        return hash;
    }
}

module.exports = {
    ConsistentHashDiscovery
}