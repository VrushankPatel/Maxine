const { serviceRegistry } = require('../../entity/service-registry');

class ConsistentHashDiscovery {
  /**
   * Use consistent hashing to return the appropriate Node based on IP.
   * @param {string} serviceName
   * @param {string} ip
   * @param {string} group
   * @param {array} tags
   * @returns {object}
   */
  getNode = (fullServiceName, ip, group, tags, deployment, filter, advancedFilters) => {
    const hashRing = serviceRegistry.hashRegistry.get(fullServiceName);
    if (!hashRing || hashRing.servers.length === 0) return null;
    const nodeName = hashRing.get(ip);
    // First check if node is in healthyNodesMap for O(1) lookup
    const healthyMap = serviceRegistry.healthyNodesMap.get(fullServiceName);
    if (healthyMap && healthyMap.has(nodeName)) {
      const node = healthyMap.get(nodeName);
      // Check group, tags, and deployment
      if (group && node.metadata.group !== group) return null;
      if (
        tags &&
        tags.length > 0 &&
        (!node.metadata.tags || !tags.every((tag) => node.metadata.tags.includes(tag)))
      )
        return null;
      if (deployment && node.metadata.deployment !== deployment) return null;
      if (filter) {
        for (const [key, value] of Object.entries(filter)) {
          if (node.metadata[key] !== value) return null;
        }
      }
      // Apply advanced filters
      if (advancedFilters) {
        for (const f of advancedFilters) {
          const value = serviceRegistry.getNodeValue(node, f.key);
          if (value === undefined) return null;

          switch (f.op) {
            case 'eq':
              if (value != f.value) return null;
              break;
            case 'ne':
              if (value == f.value) return null;
              break;
            case 'regex':
              if (!f.value.test(String(value))) return null;
              break;
            case 'lt':
              if (!(parseFloat(value) < f.value)) return null;
              break;
            case 'gt':
              if (!(parseFloat(value) > f.value)) return null;
              break;
            case 'lte':
              if (!(parseFloat(value) <= f.value)) return null;
              break;
            case 'gte':
              if (!(parseFloat(value) >= f.value)) return null;
              break;
          }
        }
      }
      return node;
    }
    return null;
  };

  invalidateCache = (fullServiceName) => {
    // Uses serviceRegistry hashRegistry, invalidated there
  };
}

module.exports = {
  ConsistentHashDiscovery,
};
