var ConsistentHashing = require('consistent-hashing');
const _ = require('lodash');

class ServiceRegistry{
    registry = {};
    timeResetters = {};
    hashRegistry = {};

    getRegServers = () => this.registry;

    getNodes = (serviceName) => (this.registry[serviceName] || {})["nodes"];

    updateHashRegistry = (serviceName) => {
        const nodes = this.getNodes(serviceName);
        const serviceNodes = _.isEmpty(nodes) ? [] : Object.keys(nodes);
        if(_.isEmpty(serviceNodes) || _.isNull(serviceNodes)){
            delete this.hashRegistry[serviceName];
            return;
        }
        const cons = new ConsistentHashing(serviceNodes);

        if(!this.hashRegistry[serviceName]){
            this.hashRegistry[serviceName] = {};
        }
        this.hashRegistry[serviceName] = cons;
    }
}

const serviceRegistry = new ServiceRegistry();

module.exports = {
    serviceRegistry
}