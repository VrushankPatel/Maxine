const ConsistentHashing = require('consistent-hashing');
const { constants } = require('../util/constants/constants');

class ServiceRegistry{
    registry = {};
    timeResetters = {};
    hashRegistry = {};

    getRegServers = () => this.registry;

    getNodes = (serviceName) => (this.registry[serviceName] || {})["nodes"];

    initHashRegistry = (serviceName) => {
        if(!this.hashRegistry[serviceName]){
            this.hashRegistry[serviceName] = new ConsistentHashing({}, constants.CONSISTENT_HASHING_OPTIONS);
        }
    }

    addNodeToHashRegistry = (serviceName, nodeName) => {
        this.initHashRegistry(serviceName);
        if(Object.values(this.hashRegistry[serviceName]["nodes"]).includes(nodeName)) return;
        this.hashRegistry[serviceName].addNode(nodeName);
    }

    removeNodeFromRegistry = (serviceName, nodeName) => {
        if(!this.hashRegistry[serviceName]){
            return;
        }
        this.hashRegistry[serviceName].removeNode(nodeName);
    }

    reset = () => {
        Object.values(this.timeResetters).forEach(clearTimeout);
        this.registry = {};
        this.timeResetters = {};
        this.hashRegistry = {};
    }
}

const serviceRegistry = new ServiceRegistry();

module.exports = {
    serviceRegistry
}
