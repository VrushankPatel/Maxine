const { LRUCache } = require('lru-cache');
const config = require("../config/config");
const { constants } = require("../util/constants/constants");
const { serviceRegistry } = require("../entity/service-registry");
const { consoleError } = require("../util/logging/logging-util");
const federationService = require("./federation-service");

class DiscoveryService{
    strategyMap = new Map();

     constructor() {
         // Preload strategies for testing compatibility, but skip in fast modes
         if (!config.ultraFastMode && !config.extremeFastMode && !config.lightningMode) {
             this.preloadStrategies();
         }
          // In lightning mode, enable lightweight caching for better performance
          if (config.lightningMode) {
              this.cache = new LRUCache({ max: 10000, ttl: 30000 }); // 10k entries, 30s TTL
              this.serviceKeys = new Map();
              this.aliasCache = new LRUCache({ max: 1000, ttl: 60000 }); // 1k aliases, 1min TTL
              this.cacheKeyCache = new LRUCache({ max: 5000, ttl: 60000 }); // 5k keys, 1min TTL
          }
     }

    preloadStrategies() {
        const strategies = [
            { key: constants.SSS.RR, module: "./discovery-services/round-robin-discovery", className: "RoundRobinDiscovery" },
            { key: constants.SSS.WRR, module: "./discovery-services/weighted-round-robin-discovery", className: "WeightedRoundRobinDiscovery" },
            { key: constants.SSS.WRANDOM, module: "./discovery-services/weighted-random-discovery", className: "WeightedRandomDiscovery" },
            { key: constants.SSS.LRT, module: "./discovery-services/least-response-time-discovery", className: "LeastResponseTimeDiscovery" },
            { key: constants.SSS.FASTEST, module: "./discovery-services/fastest-discovery", className: "FastestDiscovery" },
            { key: constants.SSS.CH, module: "./discovery-services/consistent-hash-discovery", className: "ConsistentHashDiscovery" },
            { key: constants.SSS.RH, module: "./discovery-services/rendezvous-hash-discovery", className: "RendezvousHashDiscovery" },
            { key: constants.SSS.LC, module: "./discovery-services/least-connections-discovery", className: "LeastConnectionsDiscovery" },
            { key: constants.SSS.LL, module: "./discovery-services/least-loaded-discovery", className: "LeastLoadedDiscovery" },
            { key: constants.SSS.RANDOM, module: "./discovery-services/random-discovery", className: "RandomDiscovery" },
            { key: constants.SSS.P2, module: "./discovery-services/power-of-two-discovery", className: "PowerOfTwoDiscovery" },
            { key: constants.SSS.ADAPTIVE, module: "./discovery-services/adaptive-discovery", className: "AdaptiveDiscovery" },
            { key: constants.SSS.STICKY, module: "./discovery-services/sticky-discovery", className: "StickyDiscovery" },
            { key: constants.SSS.LR, module: "./discovery-services/least-request-discovery", className: "LeastRequestDiscovery" },
            { key: constants.SSS.PRIORITY, module: "./discovery-services/priority-discovery", className: "PriorityDiscovery" },
            { key: constants.SSS.BHS, module: "./discovery-services/best-health-score-discovery", className: "BestHealthScoreDiscovery" },
            { key: constants.SSS.GEO, module: "./discovery-services/geo-discovery", className: "GeoDiscovery" },
            { key: constants.SSS.AFFINITY, module: "./discovery-services/affinity-discovery", className: "AffinityDiscovery" },
        ];

        for (const { key, module, className } of strategies) {
            try {
                const { [className]: StrategyClass } = require(module);
                this.strategyMap.set(key, new StrategyClass());
            } catch (err) {
                consoleError(`Failed to preload strategy ${key}:`, err);
            }
        }
    }

    getStrategy(strategy) {
        return this.strategyMap.get(strategy);
    }
     cache = new LRUCache({ max: config.discoveryCacheMax, ttl: config.highPerformanceMode ? 7200000 : config.discoveryCacheTTL }); // 2 hours in high perf
    serviceKeys = new Map(); // Map serviceName to set of cache keys
    cacheHits = 0;
    cacheMisses = 0;
     aliasCache = new LRUCache({ max: config.aliasCacheMax, ttl: 900000 }); // Cache for alias resolutions, 15 min TTL
    cacheKeyCache = new LRUCache({ max: config.highPerformanceMode ? 2000000 : 200000, ttl: 900000 }); // Cache for cache key building
      statefulStrategies = new Set([constants.SSS.RR, constants.SSS.WRR, constants.SSS.LR, constants.SSS.RANDOM]); // Strategies that maintain state or should not be cached for correctness
      predictiveCache = new LRUCache({ max: config.discoveryCacheMax / 4, ttl: 300000 }); // Predictive cache for 5 min

    /**
     * Get fullServiceName and IP and based on the serverSelectionStrategy we've selected, It'll call that discoveryService and retrieve the node from it. (Ex. RoundRobin, Rendezvous, ConsistentHashing).
     * @param {string} fullServiceName
     * @param {string} ip
     * @param {string} group
     * @param {string} deployment
     * @returns {object}
     */
              getNode = async (fullServiceName, ip, group, tags, deployment, filter, clientId) => {
                    if (config.ultraFastMode || config.extremeFastMode) {
                        // Ultra/extreme fast modes: direct lookup with zero overhead
                        return this.ultraFastGetNode(fullServiceName);
                    }
                    if (config.lightningMode) {
                        // Lightning mode with lightweight caching
                        const cacheKey = `${fullServiceName}:${tags ? tags.join(',') : ''}`;
                        const cached = this.cache.get(cacheKey);
                        if (cached) {
                            this.cacheHits++;
                            return cached;
                        }
                        this.cacheMisses++;
                        const node = this.ultraFastGetNode(fullServiceName);
                        if (node) {
                            this.cache.set(cacheKey, node);
                            if (!this.serviceKeys.has(fullServiceName)) {
                                this.serviceKeys.set(fullServiceName, new Set());
                            }
                            this.serviceKeys.get(fullServiceName).add(cacheKey);
                        }
                        return node;
                    }

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

         // Skip caching for stateful strategies to avoid stale results
         if (this.statefulStrategies.has(config.serverSelectionStrategy)) {
             return this.getNodeUncached(fullServiceName, ip, group, tags, deployment, filter);
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

          const node = await this.getNodeUncached(fullServiceName, ip, group, tags, deployment, filter, clientId);
         if (node) {
             this.cache.set(cacheKey, node);
             // Track keys per service
             if (!this.serviceKeys.has(fullServiceName)) {
                 this.serviceKeys.set(fullServiceName, new Set());
             }
             this.serviceKeys.get(fullServiceName).add(cacheKey);
         }
         return node;
     }

         ultraFastGetNode = (serviceName) => {
             // Use optimized random for stateless, zero-latency discovery in ultra-fast mode
             return serviceRegistry.ultraFastGetRandomNode(serviceName);
         }

        getNodeUncached = async (fullServiceName, ip, group, tags, deployment, filter, clientId) => {
            const strategy = this.getStrategy(config.serverSelectionStrategy);
           let node;
           if (config.serverSelectionStrategy === constants.SSS.CH) {
               node = strategy.getNode(fullServiceName, ip, group, tags, deployment, filter);
           } else if (config.serverSelectionStrategy === constants.SSS.RH || config.serverSelectionStrategy === constants.SSS.STICKY) {
               node = strategy.getNode(fullServiceName, ip, group, tags, deployment, filter);
           } else if (config.serverSelectionStrategy === constants.SSS.AFFINITY) {
               node = strategy.getNode(fullServiceName, clientId, group, tags, deployment, filter);
           } else {
               node = strategy.getNode(fullServiceName, group, tags, deployment, filter);
           }

           // If no local node found and federation is enabled, try federated discovery
           if (!node && config.federationEnabled) {
               const federatedResults = await federationService.discoverFromFederation(fullServiceName);
               if (federatedResults.length > 0) {
                   // Simple random selection for load balancing across datacenters
                   node = federatedResults[Math.floor(Math.random() * federatedResults.length)];
               }
           }

           return node;
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

    invalidateUltraFastCache = (serviceName) => {
        // Ultra-fast cache is handled in the controller, no action needed here
    }
}

const discoveryService = new DiscoveryService();

module.exports = {
    discoveryService
}