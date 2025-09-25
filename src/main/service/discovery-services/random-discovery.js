const { serviceRegistry } = require('../../entity/service-registry');

// Fast LCG PRNG for better performance
let lcgSeed = Date.now();
const lcgA = 1664525;
const lcgC = 1013904223;
const lcgM = 4294967296;

const fastRandom = () => {
  lcgSeed = (lcgA * lcgSeed + lcgC) % lcgM;
  return lcgSeed / lcgM;
};

class RandomDiscovery {
  /**
   * retrieve a random node based on the serviceName passed
   * @param {string} serviceName
   * @param {string} group
   * @param {array} tags
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
    const randomIndex = (fastRandom() * healthyNodes.length) | 0;
    return healthyNodes[randomIndex];
  };

  invalidateCache = (fullServiceName) => {
    // No cache
  };
}

module.exports = {
  RandomDiscovery,
};
