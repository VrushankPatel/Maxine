const { sssUtil } = require("../util/util");
const { ConsistentHashDiscovery } = require("./discovery-services/consistent-hash-discovery");
const { RoundRobinDiscovery } = require("./discovery-services/round-robin-discovery");

class DiscoveryService{
    rrd = new RoundRobinDiscovery();
    chd = new ConsistentHashDiscovery();
    getNode = (serviceName, ip) => {
        if(sssUtil.isConsistentHashing()){
            return this.chd.getNodeByConsistentHashing(serviceName, ip);
        }
        return this.rrd.getNodeByRoundRobin(serviceName);
    }
}

const discoveryService = new DiscoveryService();

module.exports = {
    discoveryService
}