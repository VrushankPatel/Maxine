const { ConsistentHashDiscovery } = require("./discovery-services/consistent-hash-discovery");
const { RendezvousHashDiscovery } = require("./discovery-services/rendezvous-hash-discovery");
const { RoundRobinDiscovery } = require("./discovery-services/round-robin-discovery");
const { WeightedRoundRobinDiscovery } = require("./discovery-services/weighted-round-robin-discovery");
const { LeastResponseTimeDiscovery } = require("./discovery-services/least-response-time-discovery");
const { LeastConnectionsDiscovery } = require("./discovery-services/least-connections-discovery");
const { LeastLoadedDiscovery } = require("./discovery-services/least-loaded-discovery");
const { RandomDiscovery } = require("./discovery-services/random-discovery");
const LRU = require('lru-cache');
const config = require("../config/config");
const { constants } = require("../util/constants/constants");

class DiscoveryService{
    rrd = new RoundRobinDiscovery();
    wrrd = new WeightedRoundRobinDiscovery();
    lrtd = new LeastResponseTimeDiscovery();
    chd = new ConsistentHashDiscovery();
    rhd = new RendezvousHashDiscovery();
    lcd = new LeastConnectionsDiscovery();
    lld = new LeastLoadedDiscovery();
    rand = new RandomDiscovery();
    cache = new LRU({ max: 100000, ttl: config.discoveryCacheTTL });
    serviceKeys = new Map(); // Map serviceName to set of cache keys

    /**
     * Get serviceName and IP and based on the serverSelectionStrategy we've selected, It'll call that discoveryService and retrieve the node from it. (Ex. RoundRobin, Rendezvous, ConsistentHashing).
     * @param {string} serviceName
     * @param {string} ip
     * @param {string} version
     * @returns {object}
     */
    getNode = (serviceName, ip, version, namespace = "default", region = "default", zone = "default") => {
        const fullServiceName = (region !== "default" || zone !== "default") ?
            (version ? `${namespace}:${region}:${zone}:${serviceName}:${version}` : `${namespace}:${region}:${zone}:${serviceName}`) :
            (version ? `${namespace}:${serviceName}:${version}` : `${namespace}:${serviceName}`);
        const usesIp = [constants.SSS.CH, constants.SSS.RH].includes(config.serverSelectionStrategy);
        const cacheKey = usesIp ? `${fullServiceName}:${ip}` : fullServiceName;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        let node;
        switch(config.serverSelectionStrategy){
            case constants.SSS.RR:
            node = this.rrd.getNode(fullServiceName);
            break;

            case constants.SSS.WRR:
            node = this.wrrd.getNode(fullServiceName);
            break;

            case constants.SSS.LRT:
            node = this.lrtd.getNode(fullServiceName);
            break;

            case constants.SSS.CH:
            node = this.chd.getNode(fullServiceName, ip);
            break;

            case constants.SSS.RH:
            node = this.rhd.getNode(fullServiceName, ip);
            break;

            case constants.SSS.LC:
            node = this.lcd.getNode(fullServiceName);
            break;

            case constants.SSS.LL:
            node = this.lld.getNode(fullServiceName);
            break;

            case constants.SSS.RANDOM:
            node = this.rand.getNode(fullServiceName);
            break;

            default:
            node = this.rrd.getNode(fullServiceName);
        }

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