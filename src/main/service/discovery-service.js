const { ConsistentHashDiscovery } = require("./discovery-services/consistent-hash-discovery");
const { RendezvousHashDiscovery } = require("./discovery-services/rendezvous-hash-discovery");
const { RoundRobinDiscovery } = require("./discovery-services/round-robin-discovery");
const { LeastConnectionsDiscovery } = require("./discovery-services/least-connections-discovery");
const { RandomDiscovery } = require("./discovery-services/random-discovery");
const config = require("../config/config");
const { constants } = require("../util/constants/constants");

class DiscoveryService{
    rrd = new RoundRobinDiscovery();
    chd = new ConsistentHashDiscovery();
    rhd = new RendezvousHashDiscovery();
    lcd = new LeastConnectionsDiscovery();
    rand = new RandomDiscovery();
    cache = new Map();

    /**
     * Get serviceName and IP and based on the serverSelectionStrategy we've selected, It'll call that discoveryService and retrieve the node from it. (Ex. RoundRobin, Rendezvous, ConsistentHashing).
     * @param {string} serviceName
     * @param {string} ip
     * @returns {object}
     */
    getNode = (serviceName, ip) => {
        const usesIp = [constants.SSS.CH, constants.SSS.RH].includes(config.serverSelectionStrategy);
        const cacheKey = usesIp ? `${serviceName}:${ip}` : serviceName;
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < config.discoveryCacheTTL) {
            return cached.node;
        }

        let node;
        switch(config.serverSelectionStrategy){
            case constants.SSS.RR:
            node = this.rrd.getNode(serviceName);
            break;

            case constants.SSS.CH:
            node = this.chd.getNode(serviceName, ip);
            break;

            case constants.SSS.RH:
            node = this.rhd.getNode(serviceName, ip);
            break;

            case constants.SSS.LC:
            node = this.lcd.getNode(serviceName);
            break;

            case constants.SSS.RANDOM:
            node = this.rand.getNode(serviceName);
            break;

            default:
            node = this.rrd.getNode(serviceName);
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