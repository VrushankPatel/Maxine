const { sssUtil } = require("../util/util");
const { ConsistentHashDiscovery } = require("./discovery-services/consistent-hash-discovery");
const { RoundRobinDiscovery } = require("./discovery-services/round-robin-discovery");

class DiscoveryService{
    rrd = new RoundRobinDiscovery();
    chd = new ConsistentHashDiscovery();
    getNode = (serviceName, ip) => {
        if(sssUtil.isConsistentHashing()){
            return this.chd.getNode(serviceName, ip);
        }
        return this.rrd.getNode(serviceName);
    }
}

const discoveryService = new DiscoveryService();

module.exports = {
    discoveryService
}