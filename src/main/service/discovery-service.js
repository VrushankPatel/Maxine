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
    cache = new LRU({ max: 1000000, ttl: config.discoveryCacheTTL });
    serviceKeys = new Map(); // Map serviceName to set of cache keys
    cacheHits = 0;
    cacheMisses = 0;
    aliasCache = new Map(); // Cache for alias resolutions

    /**
     * Get fullServiceName and IP and based on the serverSelectionStrategy we've selected, It'll call that discoveryService and retrieve the node from it. (Ex. RoundRobin, Rendezvous, ConsistentHashing).
     * @param {string} fullServiceName
     * @param {string} ip
     * @param {string} group
     * @returns {object}
     */
    getNode = (fullServiceName, ip, group) => {
         // Check if serviceName is an alias (cached)
         let resolvedServiceName = this.aliasCache.get(fullServiceName);
         if (resolvedServiceName === undefined) {
             resolvedServiceName = serviceRegistry.getServiceByAlias(fullServiceName);
             this.aliasCache.set(fullServiceName, resolvedServiceName);
         }
         if (resolvedServiceName !== fullServiceName) {
             fullServiceName = resolvedServiceName;
         }

        const usesIp = [constants.SSS.CH, constants.SSS.RH].includes(config.serverSelectionStrategy);
        const cacheKey = usesIp ? `${fullServiceName}:${ip}` : fullServiceName;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.cacheHits++;
            return cached;
        }
        this.cacheMisses++;

        let node;
        switch(config.serverSelectionStrategy){
            case constants.SSS.RR:
            node = this.rrd.getNode(fullServiceName, group);
            break;

            case constants.SSS.WRR:
            node = this.wrrd.getNode(fullServiceName, group);
            break;

            case constants.SSS.LRT:
            node = this.lrtd.getNode(fullServiceName, group);
            break;

            case constants.SSS.FASTEST:
            node = this.fd.getNode(fullServiceName, group);
            break;

            case constants.SSS.CH:
            node = this.chd.getNode(fullServiceName, ip);
            break;

            case constants.SSS.RH:
            node = this.rhd.getNode(fullServiceName, ip);
            break;

            case constants.SSS.LC:
            node = this.lcd.getNode(fullServiceName, group);
            break;

            case constants.SSS.LL:
            node = this.lld.getNode(fullServiceName, group);
            break;

            case constants.SSS.RANDOM:
            node = this.rand.getNode(fullServiceName, group);
            break;

            case constants.SSS.P2:
            node = this.p2d.getNode(fullServiceName, group);
            break;

             case constants.SSS.ADAPTIVE:
             node = this.ad.getNode(fullServiceName, group);
             break;

             case constants.SSS.STICKY:
             node = this.sd.getNode(fullServiceName, ip, group);
             break;

             default:
             node = this.rrd.getNode(fullServiceName, group);
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
        this.rrd.invalidateCache(fullServiceName);
        this.wrrd.invalidateCache(fullServiceName);
        this.lrtd.invalidateCache(fullServiceName);
        this.fd.invalidateCache(fullServiceName);
        this.chd.invalidateCache(fullServiceName);
        this.rhd.invalidateCache(fullServiceName);
        this.lcd.invalidateCache(fullServiceName);
        this.lld.invalidateCache(fullServiceName);
         this.rand.invalidateCache(fullServiceName);
         this.p2d.invalidateCache(fullServiceName);
         this.ad.invalidateCache(fullServiceName);
         this.sd.invalidateCache(fullServiceName);
    }
}

const discoveryService = new DiscoveryService();

module.exports = {
    discoveryService
}