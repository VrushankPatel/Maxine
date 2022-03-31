const { ServerSelectionStrategy } = require("../entity/server-selection-strategy");
var ConsistentHashing = require('consistent-hashing');
const _ = require('lodash');

class RegistryService{
    serviceRegistry = {};
    timeResetters = {};
    consistentHashRegistry = {};

    registerService = (serviceObj) => {
        const {serviceName, nodeName, address, timeOut, weight} = serviceObj;

        if (!this.serviceRegistry[serviceName]){
            this.serviceRegistry[serviceName] = {offset: 0, nodes: {}};
        }

        [...Array(weight).keys()].forEach(index => {
            const subNodeName = `${nodeName}-${index}`;

            if(this.serviceRegistry[serviceName]["nodes"][subNodeName]){
                clearTimeout(this.timeResetters[this.serviceRegistry[serviceName]["nodes"][subNodeName]["nodeName"]]);
            }

            this.serviceRegistry[serviceName]["nodes"][subNodeName] = {
                "nodeName" : subNodeName,
                "parentNode" : nodeName,
                "address" : address,
                "timeOut" : timeOut,
                "registeredAt" : new Date().toLocaleString()
            }

            this.updateConsistentHashRegistry(serviceName);

            const timeResetter = setTimeout(() => {
                delete this.serviceRegistry[serviceName]["nodes"][subNodeName];
                if(Object.keys(this.serviceRegistry[serviceName]["nodes"]).length === 0){
                    delete this.serviceRegistry[serviceName];
                    delete this.consistentHashRegistry[serviceName];
                }
                this.updateConsistentHashRegistry(serviceName);
            }, ((timeOut)*1000)+500);

            this.timeResetters[subNodeName] = timeResetter;
        });
    }

    registryService = (serviceObj) => {
        setTimeout(this.registerService, 0, serviceObj);
        serviceObj.registeredAt = new Date().toLocaleString();
        return serviceObj;
    }

    updateConsistentHashRegistry = (serviceName) => {
        const nodes = this.getNodes(serviceName);
        if(_.isEmpty(nodes)){
            return;
        }
        const serviceNodes = Object.keys(nodes);
        if(_.isEmpty(serviceNodes) || _.isNull(serviceNodes)){
            delete this.consistentHashRegistry[serviceName];
            return;
        }
        const cons = new ConsistentHashing(serviceNodes);

        if(!this.consistentHashRegistry[serviceName]){
            this.consistentHashRegistry[serviceName] = {};
        }
        this.consistentHashRegistry[serviceName] = cons;
    }

    getCurrentlyRegisteredServers = () => this.serviceRegistry;

    getServers = (serviceName) => this.serviceRegistry[serviceName];

    getNodes = (serviceName) => {
        const servers = this.getServers(serviceName) || {};
        return servers["nodes"];
    }

    getOffsetAndIncrement = (serviceName) => {
        const servers = this.getServers(serviceName) || {};
        return servers["offset"]++;
    }

    getNode = (serviceName) => {
        if(ServerSelectionStrategy.isConsistentHashing()){
            return this.getNodeByConsistentHashing(serviceName, "sample-ip-1");
        }
        return this.getNodeByRoundRobin(serviceName);
    }

    getNodeByRoundRobin = (serviceName) => {
        const nodes = this.getNodes(serviceName) || {};
        const offset = this.getOffsetAndIncrement(serviceName) || 0;
        const keys = Object.keys(nodes);
        const key = keys[offset % keys.length];
        return nodes[key];
    }

    getNodeByConsistentHashing = (serviceName, ip) => {
        const serviceNodesObj = this.getNodes(serviceName);
        const cons = this.consistentHashRegistry[serviceName];
        if(_.isEmpty(cons)){
            return {};
        }
        const nodeName = cons.getNode(ip);
        return serviceNodesObj[nodeName];
    }
}

const registryService = new RegistryService();

module.exports = {
    registryService
}