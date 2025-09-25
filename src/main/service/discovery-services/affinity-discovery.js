const { serviceRegistry } = require("../../entity/service-registry");
const crypto = require('crypto');

class AffinityDiscovery {
    /**
     * Retrieve a node based on clientId affinity (sticky sessions)
     * Uses hash of clientId to consistently select the same node
     * @param {string} serviceName
     * @param {string} clientId
     * @param {string} group
     * @param {array} tags
     * @returns {object}
     */
    getNode = (fullServiceName, clientId, group, tags, deployment, filter, advancedFilters) => {
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName, group, tags, deployment, filter, advancedFilters);
        if (healthyNodes.length === 0) return null;
        if (!clientId) {
            // Fallback to random if no clientId
            const randomIndex = Math.floor(Math.random() * healthyNodes.length);
            return healthyNodes[randomIndex];
        }
        // Use hash of clientId for consistent selection
        const hash = crypto.createHash('md5').update(clientId).digest('hex');
        const index = parseInt(hash.substring(0, 8), 16) % healthyNodes.length;
        return healthyNodes[index];
    }

    invalidateCache = (fullServiceName) => {
        // No cache
    }
}

module.exports = {
    AffinityDiscovery
}