const { ConsistentHashDiscovery } = require("./discovery-services/consistent-hash-discovery");
const { RendezvousHashDiscovery } = require("./discovery-services/rendezvous-hash-discovery");
const { RoundRobinDiscovery } = require("./discovery-services/round-robin-discovery");
const { WeightedRoundRobinDiscovery } = require("./discovery-services/weighted-round-robin-discovery");
const { LeastResponseTimeDiscovery } = require("./discovery-services/least-response-time-discovery");
const { LeastConnectionsDiscovery } = require("./discovery-services/least-connections-discovery");
const { RandomDiscovery } = require("./discovery-services/random-discovery");
const config = require("../config/config");
const { constants } = require("../util/constants/constants");

class DiscoveryService{
    rrd = new RoundRobinDiscovery();
    wrrd = new WeightedRoundRobinDiscovery();
    lrtd = new LeastResponseTimeDiscovery();
    chd = new ConsistentHashDiscovery();
    rhd = new RendezvousHashDiscovery();
    lcd = new LeastConnectionsDiscovery();
    rand = new RandomDiscovery();
    cache = new Map();

    /**
     * Get serviceName and IP and based on the serverSelectionStrategy we've selected, It'll call that discoveryService and retrieve the node from it. (Ex. RoundRobin, Rendezvous, ConsistentHashing).
     * @param {string} serviceName
     * @param {string} ip
     * @param {string} version
     * @returns {object}
     */
    getNode = (serviceName, ip, version) => {
        const usesIp = [constants.SSS.CH, constants.SSS.RH].includes(config.serverSelectionStrategy);
        const cacheKey = usesIp ? `${serviceName}:${version || ''}:${ip}` : `${serviceName}:${version || ''}`;
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < config.discoveryCacheTTL) {
            return cached.node;
        }

        let node;
        switch(config.serverSelectionStrategy){
            case constants.SSS.RR:
            node = this.rrd.getNode(serviceName, version);
            break;

            case constants.SSS.WRR:
            node = this.wrrd.getNode(serviceName, version);
            break;

            case constants.SSS.LRT:
            node = this.lrtd.getNode(serviceName, version);
            break;

            case constants.SSS.CH:
            node = this.chd.getNode(serviceName, ip, version);
            break;

            case constants.SSS.RH:
            node = this.rhd.getNode(serviceName, ip, version);
            break;

            case constants.SSS.LC:
            node = this.lcd.getNode(serviceName, version);
            break;

            case constants.SSS.RANDOM:
            node = this.rand.getNode(serviceName, version);
            break;

            default:
            node = this.rrd.getNode(serviceName, version);
        }

        this.cache.set(cacheKey, { node, timestamp: Date.now() });
        return node;
    }

    clearCache = () => {
        this.cache.clear();
    }
}

const discoveryService = new DiscoveryService();

module.exports = {
    discoveryService
}