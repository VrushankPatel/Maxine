const Service = require("../entity/service-body");
const { serviceRegistry: sRegistry } = require("../entity/service-registry");
const _ = require('lodash');
class RegistryService{

    registerService = (serviceObj) => {
        const {serviceName, nodeName, address, timeOut, weight} = serviceObj;

        if (!sRegistry.registry[serviceName]){
            sRegistry.registry[serviceName] = {offset: 0, nodes: {}};
        }

        [...Array(weight).keys()].forEach(index => {
            const subNodeName = `${nodeName}-${index}`;

            sRegistry.addNodeToHashRegistry(serviceName, subNodeName);

            if(sRegistry.registry[serviceName]["nodes"][subNodeName]){
                clearTimeout(
                    sRegistry
                        .timeResetters[sRegistry
                                        .registry[serviceName]["nodes"][subNodeName]["nodeName"]]);
            }

            sRegistry.registry[serviceName]["nodes"][subNodeName] = {
                "nodeName" : subNodeName,
                "parentNode" : nodeName,
                "address" : address,
                "timeOut" : timeOut,
                "registeredAt" : Date.now(),
                "healthy" : true,
                "failureCount" : 0,
                "lastFailureTime" : null
            }

            sRegistry.addToHealthyNodes(serviceName, subNodeName);

            const timeResetter = setTimeout(() => {
                delete sRegistry.registry[serviceName]["nodes"][subNodeName];
                if(Object.keys(sRegistry.registry[serviceName]["nodes"]).length === 0){
                    delete sRegistry.registry[serviceName];
                }
                sRegistry.removeNodeFromRegistry(serviceName, subNodeName);
                if(Object.keys(sRegistry.hashRegistry[serviceName]["nodes"]).length === 0){
                    delete sRegistry.hashRegistry[serviceName];
                }
            }, ((timeOut)*1000)+500);

            sRegistry.timeResetters[subNodeName] = timeResetter;
        });
    }

    registryService = (serviceObj) => {
        let service = Service.buildByObj(serviceObj);
        if(!service || _.isNull(service)) return;
        setTimeout(this.registerService, 0, service);
        service.registeredAt = new Date().toLocaleString();
        return service;
    }

    deregisterService = (serviceName, nodeName) => {
        if (!sRegistry.registry[serviceName]) return false;
        const nodes = sRegistry.registry[serviceName].nodes;
        const toRemove = Object.keys(nodes).filter(key => nodes[key].parentNode === nodeName);
        toRemove.forEach(subNode => {
            if (sRegistry.timeResetters[subNode]) {
                clearTimeout(sRegistry.timeResetters[subNode]);
                delete sRegistry.timeResetters[subNode];
            }
            delete nodes[subNode];
            sRegistry.removeNodeFromRegistry(serviceName, subNode);
        });
        if (Object.keys(nodes).length === 0) {
            delete sRegistry.registry[serviceName];
            delete sRegistry.hashRegistry[serviceName];
        }
        return true;
    }
}

const registryService = new RegistryService();

module.exports = {
    registryService
}