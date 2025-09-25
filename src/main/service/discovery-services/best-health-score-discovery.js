const { serviceRegistry } = require('../../entity/service-registry');

class BestHealthScoreDiscovery {
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
    // Find the node with the best (lowest) health score
    let bestNode = healthyNodes[0];
    let bestScore = serviceRegistry.getHealthScore(fullServiceName, bestNode.nodeName);
    for (let i = 1; i < healthyNodes.length; i++) {
      const node = healthyNodes[i];
      const score = serviceRegistry.getHealthScore(fullServiceName, node.nodeName);
      if (score < bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }
    return bestNode;
  };

  invalidateCache = (fullServiceName) => {
    // No cache to invalidate
  };
}

module.exports = {
  BestHealthScoreDiscovery,
};
