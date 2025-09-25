const { serviceRegistry } = require('../../entity/service-registry');

class LeastLoadedDiscovery {
  constructor() {
    this.cache = new Map(); // serviceName -> {node, timestamp}
    this.cacheTTL = 1000; // 1 second
  }

  /**
   * Retrieve the node with the least active connections for the given serviceName
   * @param {string} serviceName
   * @param {string} group
   * @param {array} tags
   * @returns {object}
   */
  getNode = (fullServiceName, group, tags, deployment, filter, advancedFilters) => {
    const cached = this.cache.get(fullServiceName);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.node;
    }
    const healthyNodes = serviceRegistry.getHealthyNodes(
      fullServiceName,
      group,
      tags,
      deployment,
      filter,
      advancedFilters
    );
    if (healthyNodes.length === 0) return null;

    let minConnections = Infinity;
    let selectedNode = null;

    for (const node of healthyNodes) {
      const connections = serviceRegistry.getActiveConnections(fullServiceName, node.nodeName);
      if (connections < minConnections) {
        minConnections = connections;
        selectedNode = node;
      }
    }

    this.cache.set(fullServiceName, { node: selectedNode, timestamp: Date.now() });
    return selectedNode;
  };

  invalidateCache = (fullServiceName) => {
    this.cache.delete(fullServiceName);
  };
}

module.exports = {
  LeastLoadedDiscovery,
};
