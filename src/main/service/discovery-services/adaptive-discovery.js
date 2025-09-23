const { serviceRegistry } = require("../../entity/service-registry");

class AdaptiveDiscovery {
    constructor() {
        this.cache = new Map(); // serviceName -> {node, timestamp}
        this.cacheTTL = 5000; // 5 seconds
    }

    /**
      * Selects the best node based on a combination of response time, active connections, and health.
      * Prioritizes nodes with lower response times and fewer connections.
      * @param {string} fullServiceName
      * @param {string} group
      * @param {array} tags
      * @returns {object}
      */
    getNode(fullServiceName, group, tags, deployment, filter) {
        const cached = this.cache.get(fullServiceName);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
            return cached.node;
        }
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName, group, tags, deployment, filter);
        if (healthyNodes.length === 0) return null;

        let bestNode = null;
        let bestScore = Infinity;

        for (const node of healthyNodes) {
            const avgResponseTime = serviceRegistry.getAverageResponseTime(fullServiceName, node.nodeName) || 100; // default 100ms
            const activeConnections = serviceRegistry.getActiveConnections(fullServiceName, node.nodeName);
            const weight = parseInt(node.metadata?.weight) || 1;

            // Score: lower is better. Combines response time and connections, adjusted by weight
            const score = (avgResponseTime / weight) + (activeConnections * 10);

            if (score < bestScore) {
                bestScore = score;
                bestNode = node;
            }
        }

        this.cache.set(fullServiceName, { node: bestNode, timestamp: Date.now() });
        return bestNode;
    }

    invalidateCache = (fullServiceName) => {
        this.cache.delete(fullServiceName);
    }
}

module.exports = {
    AdaptiveDiscovery
}