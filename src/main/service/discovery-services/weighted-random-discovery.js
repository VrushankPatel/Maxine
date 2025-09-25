const { serviceRegistry } = require("../../entity/service-registry");

// Fast LCG PRNG
let lcgSeed = Date.now();
const lcgA = 1664525;
const lcgC = 1013904223;
const lcgM = 4294967296;

const fastRandom = () => {
    lcgSeed = (lcgA * lcgSeed + lcgC) % lcgM;
    return lcgSeed / lcgM;
};

class WeightedRandomDiscovery {
    constructor() {
        this.weightedLists = new Map(); // serviceName -> { nodes: [], weights: [], cumulative: [] }
    }

    /**
      * Retrieve the node based on the serviceName passed, using weighted random algorithm
      * @param {string} serviceName
      * @param {string} group
      * @param {array} tags
      * @returns {object}
      */
    getNode = (fullServiceName, group, tags, deployment, filter, advancedFilters) => {
        const healthy = serviceRegistry.getHealthyNodes(fullServiceName, group, tags, deployment, filter, advancedFilters);
        if (healthy.length === 0) return null;

        // Build weighted list if not cached or changed
        const cacheKey = `${fullServiceName}:${deployment || ''}`;
        if (!this.weightedLists.has(cacheKey)) {
            this.buildWeightedList(cacheKey, healthy);
        }

        const weighted = this.weightedLists.get(cacheKey);
        if (!weighted || weighted.nodes.length === 0) return null;

        const rand = fastRandom() * weighted.cumulative[weighted.cumulative.length - 1];
        for (let i = 0; i < weighted.cumulative.length; i++) {
            if (rand <= weighted.cumulative[i]) {
                return weighted.nodes[i];
            }
        }
        return weighted.nodes[0]; // fallback
    }

    buildWeightedList = (fullServiceName, healthy) => {
        const nodes = [];
        const weights = [];
        const cumulative = [];
        let sum = 0;
        for (const node of healthy) {
            const weight = parseInt(node.metadata?.weight) || 1;
            nodes.push(node);
            weights.push(weight);
            sum += weight;
            cumulative.push(sum);
        }
        this.weightedLists.set(fullServiceName, { nodes, weights, cumulative });
    }

    invalidateCache = (fullServiceName) => {
        // Delete all keys starting with fullServiceName
        for (const key of this.weightedLists.keys()) {
            if (key.startsWith(fullServiceName)) {
                this.weightedLists.delete(key);
            }
        }
    }
}

module.exports = {
    WeightedRandomDiscovery
}