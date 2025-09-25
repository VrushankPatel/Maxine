const { serviceRegistry } = require('../../entity/service-registry');

class LeastRequestDiscovery {
  constructor() {
    this.cache = new Map(); // Cache for quick lookup
  }

  /**
   * Retrieve the node with the least active connections
   * @param {string} fullServiceName
   * @param {string} group
   * @param {array} tags
   * @param {string} deployment
   * @returns {object}
   */
  getNode = (fullServiceName, group, tags, deployment, filter, advancedFilters) => {
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

    return selectedNode;
  };

  invalidateCache = (fullServiceName) => {
    // No specific cache to invalidate
  };
}

module.exports = {
  LeastRequestDiscovery,
};
