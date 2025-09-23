const { ConsistentHashDiscovery } = require("./discovery-services/consistent-hash-discovery");
const { RendezvousHashDiscovery } = require("./discovery-services/rendezvous-hash-discovery");
const { RoundRobinDiscovery } = require("./discovery-services/round-robin-discovery");
const { WeightedRoundRobinDiscovery } = require("./discovery-services/weighted-round-robin-discovery");
const { LeastResponseTimeDiscovery } = require("./discovery-services/least-response-time-discovery");
const { FastestDiscovery } = require("./discovery-services/fastest-discovery");
const { LeastConnectionsDiscovery } = require("./discovery-services/least-connections-discovery");
const { LeastLoadedDiscovery } = require("./discovery-services/least-loaded-discovery");
const { RandomDiscovery } = require("./discovery-services/random-discovery");
const { PowerOfTwoDiscovery } = require("./discovery-services/power-of-two-discovery");
const { AdaptiveDiscovery } = require("./discovery-services/adaptive-discovery");
const { StickyDiscovery } = require("./discovery-services/sticky-discovery");
const { LeastRequestDiscovery } = require("./discovery-services/least-request-discovery");
const LRU = require('lru-cache');
const config = require("../config/config");
const { constants } = require("../util/constants/constants");
const { serviceRegistry } = require("../entity/service-registry");

class DiscoveryService{
    rrd = new RoundRobinDiscovery();
    wrrd = new WeightedRoundRobinDiscovery();
    lrtd = new LeastResponseTimeDiscovery();
    fd = new FastestDiscovery();
    chd = new ConsistentHashDiscovery();
    rhd = new RendezvousHashDiscovery();
    lcd = new LeastConnectionsDiscovery();
    lld = new LeastLoadedDiscovery();
    rand = new RandomDiscovery();
    p2d = new PowerOfTwoDiscovery();
    ad = new AdaptiveDiscovery();
    sd = new StickyDiscovery();
    lrd = new LeastRequestDiscovery();
    strategyMap = new Map([
        [constants.SSS.RR, this.rrd],
        [constants.SSS.WRR, this.wrrd],
        [constants.SSS.LRT, this.lrtd],
        [constants.SSS.FASTEST, this.fd],
        [constants.SSS.CH, this.chd],
        [constants.SSS.RH, this.rhd],
        [constants.SSS.LC, this.lcd],
        [constants.SSS.LL, this.lld],
        [constants.SSS.RANDOM, this.rand],
        [constants.SSS.P2, this.p2d],
        [constants.SSS.ADAPTIVE, this.ad],
        [constants.SSS.STICKY, this.sd],
        [constants.SSS.LR, this.lrd]
    ]);
    cache = new LRU({ max: config.discoveryCacheMax, ttl: config.discoveryCacheTTL });
    serviceKeys = new Map(); // Map serviceName to set of cache keys
    cacheHits = 0;
    cacheMisses = 0;
    aliasCache = new LRU({ max: Math.max(config.aliasCacheMax, 10000), ttl: 900000 }); // Cache for alias resolutions, 15 min TTL, at least 10k
    cacheKeyCache = new LRU({ max: 100000, ttl: 900000 }); // Cache for cache key building

    /**
     * Get fullServiceName and IP and based on the serverSelectionStrategy we've selected, It'll call that discoveryService and retrieve the node from it. (Ex. RoundRobin, Rendezvous, ConsistentHashing).
     * @param {string} fullServiceName
     * @param {string} ip
     * @param {string} group
     * @param {string} deployment
     * @returns {object}
     */
    getNode = (fullServiceName, ip, group, tags, deployment) => {
           // Check if serviceName is an alias (cached) - disabled in high performance mode
           if (!config.highPerformanceMode) {
               let resolvedServiceName = this.aliasCache.get(fullServiceName);
               if (resolvedServiceName === undefined) {
                   resolvedServiceName = serviceRegistry.getServiceByAlias(fullServiceName);
                   this.aliasCache.set(fullServiceName, resolvedServiceName);
               }
               if (resolvedServiceName !== fullServiceName) {
                   fullServiceName = resolvedServiceName;
               }
           }

        const usesIp = [constants.SSS.CH, constants.SSS.RH, constants.SSS.STICKY].includes(config.serverSelectionStrategy);
        const groupKey = group ? `:${group}` : '';
        const tagsKey = tags && tags.length > 0 ? `:${tags.sort().join(',')}` : '';
        const deploymentKey = deployment ? `:${deployment}` : '';
        const cacheKeyInput = `${fullServiceName}:${usesIp ? ip : ''}:${groupKey}:${tagsKey}:${deploymentKey}`;
        let cacheKey = this.cacheKeyCache.get(cacheKeyInput);
        if (!cacheKey) {
            cacheKey = usesIp ? `${fullServiceName}:${ip}${groupKey}${tagsKey}${deploymentKey}` : `${fullServiceName}${groupKey}${tagsKey}${deploymentKey}`;
            this.cacheKeyCache.set(cacheKeyInput, cacheKey);
        }
        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.cacheHits++;
            return cached;
        }
        this.cacheMisses++;

        const strategy = this.strategyMap.get(config.serverSelectionStrategy) || this.rrd;
        let node;
        if (config.serverSelectionStrategy === constants.SSS.CH) {
            node = strategy.getNode(fullServiceName, ip, group, tags, deployment);
        } else if (config.serverSelectionStrategy === constants.SSS.RH || config.serverSelectionStrategy === constants.SSS.STICKY) {
            node = strategy.getNode(fullServiceName, ip, group, tags, deployment);
        } else {
            node = strategy.getNode(fullServiceName, group, tags, deployment);
        }

        if (node) {
            this.cache.set(cacheKey, node);
            // Track keys per service
            if (!this.serviceKeys.has(fullServiceName)) {
                this.serviceKeys.set(fullServiceName, new Set());
            }
            this.serviceKeys.get(fullServiceName).add(cacheKey);
            return node;
        }

        return null;
    }

    clearCache = () => {
        this.cache.clear();
    }

    invalidateServiceCache = (fullServiceName) => {
        // Remove all cache entries for this service
        if (this.serviceKeys.has(fullServiceName)) {
            const keys = this.serviceKeys.get(fullServiceName);
            keys.forEach(key => this.cache.delete(key));
            this.serviceKeys.delete(fullServiceName);
        }
        // Invalidate strategy caches
        for (const strategy of this.strategyMap.values()) {
            strategy.invalidateCache(fullServiceName);
        }
    }
}

const discoveryService = new DiscoveryService();

module.exports = {
    discoveryService
}