var ConsistentHashing = require('consistent-hashing');
const _ = require('lodash');

class ServiceRegistry{
    registry = {};
    timeResetters = {};
    hashRegistry = {};

    getRegServers = () => this.registry;

    getNodes = (serviceName) => (this.registry[serviceName] || {})["nodes"];

    initHashRegistry = (serviceName) => {
        if(!this.hashRegistry[serviceName]){
            this.hashRegistry[serviceName] = new ConsistentHashing({});
        }
    }

    addNodeToHashRegistry = (serviceName) => {
        const nodes = this.getNodes(serviceName);
        const serviceNodes = _.isEmpty(nodes) ? [] : Object.keys(nodes);
        if(_.isEmpty(serviceNodes) || _.isNull(serviceNodes)){
            delete this.hashRegistry[serviceName];
            return;
        }
        const cons = new ConsistentHashing(serviceNodes);
        cons.addNode('node-x-1-2');
        this.hashRegistry[serviceName] = cons;
    }

    addNodeToHashRegistry = (serviceName, nodeName) => {
        this.initHashRegistry(serviceName);
        this.hashRegistry[serviceName].addNode(nodeName);
    }
c
    removeNodeFromRegistry = (serviceName, nodeName) => {
        this.hashRegistry[serviceName].removeNode(nodeName);
    }
}

const serviceRegistry = new ServiceRegistry();

module.exports = {
    serviceRegistry
}