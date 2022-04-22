const { ConsistentHashDiscovery } = require("./discovery-services/consistent-hash-discovery");
const { RendezvousHashDiscovery } = require("./discovery-services/rendezvous-hash-discovery");
const { RoundRobinDiscovery } = require("./discovery-services/round-robin-discovery");
const config = require("../config/config");
const { constants } = require("../util/constants/constants");

class DiscoveryService{
    rrd = new RoundRobinDiscovery();
    chd = new ConsistentHashDiscovery();
    rhd = new RendezvousHashDiscovery();

    /**
     * Get serviceName and IP and based on the serverSelectionStrategy we've selected, It'll call that discoveryService and retrieve the node from it. (Ex. RoundRobin, Rendezvous, ConsistentHashing).
     * @param {string} serviceName
     * @param {string} ip
     * @returns {object}
     */
    getNode = (serviceName, ip) => {
        switch(config.serverSelectionStrategy){
            case constants.SSS.RR:
            return this.rrd.getNode(serviceName, ip);

            case constants.SSS.CH:
            return this.chd.getNode(serviceName, ip);

            case constants.SSS.RH:
            return this.rhd.getNode(serviceName, ip);

            default:
            return this.rrd.getNode(serviceName, ip);
        }
    }
}

const discoveryService = new DiscoveryService();

module.exports = {
    discoveryService
}