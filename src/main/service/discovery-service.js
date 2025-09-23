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
    cache = new LRU({ max: 1000000, ttl: config.discoveryCacheTTL });
    serviceKeys = new Map(); // Map serviceName to set of cache keys

    /**
     * Get fullServiceName and IP and based on the serverSelectionStrategy we've selected, It'll call that discoveryService and retrieve the node from it. (Ex. RoundRobin, Rendezvous, ConsistentHashing).
     * @param {string} fullServiceName
     * @param {string} ip
     * @returns {object}
     */
    getNode = (fullServiceName, ip) => {
        // Check if serviceName is an alias
        const resolvedServiceName = serviceRegistry.getServiceByAlias(fullServiceName);
        if (resolvedServiceName !== fullServiceName) {
            fullServiceName = resolvedServiceName;
        }

        const usesIp = [constants.SSS.CH, constants.SSS.RH].includes(config.serverSelectionStrategy);
        const cacheKey = usesIp ? `${fullServiceName}:${ip}` : fullServiceName;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        let nodeName;
        switch(config.serverSelectionStrategy.name){
            case 'RR':
            nodeName = this.rrd.getNode(fullServiceName);
            break;

            case 'WRR':
            nodeName = this.wrrd.getNode(fullServiceName);
            break;

            case 'LRT':
            nodeName = this.lrtd.getNode(fullServiceName);
            break;

            case 'FASTEST':
            nodeName = this.fd.getNode(fullServiceName);
            break;

            case 'CH':
            nodeName = this.chd.getNode(fullServiceName, ip);
            break;

            case 'RH':
            nodeName = this.rhd.getNode(fullServiceName, ip);
            break;

            case 'LC':
            nodeName = this.lcd.getNode(fullServiceName);
            break;

            case 'LL':
            nodeName = this.lld.getNode(fullServiceName);
            break;

            case 'RANDOM':
            nodeName = this.rand.getNode(fullServiceName);
            break;

            case 'P2':
            nodeName = this.p2d.getNode(fullServiceName);
            break;

            case 'ADAPTIVE':
            nodeName = this.ad.getNode(fullServiceName);
            break;

            default:
            nodeName = this.rrd.getNode(fullServiceName);
        }

        if (nodeName) {
            const nodes = serviceRegistry.getNodes(fullServiceName);
            const node = nodes[nodeName];
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
    }
}

const discoveryService = new DiscoveryService();

module.exports = {
    discoveryService
}