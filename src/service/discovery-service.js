const { sssUtil } = require("../util/util");
const { ConsistentHashDiscovery } = require("./discovery-services/consistent-hash-discovery");
const { RendezvousHashDiscovery } = require("./discovery-services/rendezvous-hash-discovery");
const { RoundRobinDiscovery } = require("./discovery-services/round-robin-discovery");
const _ = require('lodash');

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
        if(sssUtil.isRoundRobin()) return this.rrd.getNode(serviceName, ip);
        else if(sssUtil.isRendezvousHashing()) return this.rhd.getNode(serviceName, ip);
        else if(sssUtil.isConsistentHashing()) return this.chd.getNode(serviceName, ip);
        return this.rrd.getNode(serviceName, ip);
    }
}

const discoveryService = new DiscoveryService();

module.exports = {
    discoveryService
}