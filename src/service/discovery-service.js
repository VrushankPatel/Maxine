const { sssUtil } = require("../util/util");
const { ConsistentHashDiscovery } = require("./discovery-services/consistent-hash-discovery");
const { RendezvousHashDiscovery } = require("./discovery-services/rendezvous-hash-discovery");
const { RoundRobinDiscovery } = require("./discovery-services/round-robin-discovery");

class DiscoveryService{
    rrd = new RoundRobinDiscovery();
    chd = new ConsistentHashDiscovery();
    rhd = new RendezvousHashDiscovery();

    getNode = (serviceName, ip) => {
        if(sssUtil.isConsistentHashing()){
            return this.chd.getNode(serviceName, ip);
        }
        if(sssUtil.isRendezvousHashing()){
            return this.rhd.getNode(serviceName, ip);
        }
        return this.rrd.getNode(serviceName);
    }
}

const discoveryService = new DiscoveryService();

module.exports = {
    discoveryService
}