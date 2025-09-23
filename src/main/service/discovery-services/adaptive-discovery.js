const { serviceRegistry } = require("../../entity/service-registry");

class AdaptiveDiscovery {
    /**
     * Selects the best node based on a combination of response time, active connections, and health.
     * Prioritizes nodes with lower response times and fewer connections.
     * @param {string} fullServiceName
     * @returns {object}
     */
    getNode(fullServiceName) {
        const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName);
        if (healthyNodeNames.length === 0) return null;

        const nodes = serviceRegistry.getNodes(fullServiceName);
        let bestNodeName = null;
        let bestScore = Infinity;

        for (const nodeName of healthyNodeNames) {
            const node = nodes[nodeName];
            if (!node) continue;

            const avgResponseTime = serviceRegistry.getAverageResponseTime(fullServiceName, nodeName) || 100; // default 100ms
            const activeConnections = serviceRegistry.getActiveConnections(fullServiceName, nodeName);
            const weight = parseInt(node.weight) || 1;

            // Score: lower is better. Combines response time and connections, adjusted by weight
            const score = (avgResponseTime / weight) + (activeConnections * 10);

            if (score < bestScore) {
                bestScore = score;
                bestNodeName = nodeName;
            }
        }

        if (!bestNodeName) return null;
        return nodes[bestNodeName] || null;
    }
}

module.exports = {
    AdaptiveDiscovery
}