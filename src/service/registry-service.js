var ConsistentHashing = require('consistent-hashing');
const _ = require('lodash');
const util = require("../util/util");

class RegistryService{
    serviceRegistry = {};
    timeResetters = {};
    hashRegistry = {};

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

            const timeResetter = setTimeout(() => {
                delete this.serviceRegistry[serviceName]["nodes"][subNodeName];
                if(Object.keys(this.serviceRegistry[serviceName]["nodes"]).length === 0){
                    delete this.serviceRegistry[serviceName];
                }
            }, ((timeOut)*1000)+500);
            this.timeResetters[subNodeName] = timeResetter;
        });
        setTimeout(() => {
            this.updateHashRegistry(serviceName);
        }, ((timeOut)*1000)+500);
        this.updateHashRegistry(serviceName);
    }

    registryService = (serviceObj) => {
        setTimeout(this.registerService, 0, serviceObj);
        serviceObj.registeredAt = new Date().toLocaleString();
        return serviceObj;
    }

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

    getCurrentlyRegisteredServers = () => this.serviceRegistry;

    getNode = (serviceName, ip) => {
        if(util.sssUtil.isConsistentHashing()){
            return this.getNodeByConsistentHashing(serviceName, ip);
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
        const cons = this.hashRegistry[serviceName];
        if(_.isEmpty(cons)) return {};
        const nodeName = cons.getNode(ip);
        return serviceNodesObj[nodeName];
    }

    getNodes = (serviceName) => (this.serviceRegistry[serviceName] || {})["nodes"];

    getOffsetAndIncrement = (serviceName) => {
        return (this.serviceRegistry[serviceName] || {})["offset"]++;
    }
}

const registryService = new RegistryService();

module.exports = {
    registryService
}