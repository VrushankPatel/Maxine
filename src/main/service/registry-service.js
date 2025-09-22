const Service = require("../entity/service-body");
const { serviceRegistry: sRegistry } = require("../entity/service-registry");
const _ = require('lodash');
class RegistryService{

    registerService = (serviceObj) => {
        const {serviceName, version, nodeName, address, timeOut, weight, metadata} = serviceObj;
        const fullServiceName = version ? `${serviceName}:${version}` : serviceName;

        if (!sRegistry.registry[fullServiceName]){
            sRegistry.registry[fullServiceName] = {offset: 0, nodes: {}};
        }

        [...Array(weight).keys()].forEach(index => {
            const subNodeName = `${nodeName}-${index}`;

            sRegistry.addNodeToHashRegistry(fullServiceName, subNodeName);

            if(sRegistry.registry[fullServiceName]["nodes"][subNodeName]){
                clearTimeout(
                    sRegistry
                        .timeResetters[sRegistry
                                        .registry[fullServiceName]["nodes"][subNodeName]["nodeName"]]);
            }

            sRegistry.registry[fullServiceName]["nodes"][subNodeName] = {
                "nodeName" : subNodeName,
                "parentNode" : nodeName,
                "address" : address,
                "timeOut" : timeOut,
                "registeredAt" : Date.now(),
                "healthy" : true,
                "failureCount" : 0,
                "lastFailureTime" : null,
                "metadata" : metadata
            }

            sRegistry.addToHealthyNodes(fullServiceName, subNodeName);

            const timeResetter = setTimeout(() => {
                delete sRegistry.registry[fullServiceName]["nodes"][subNodeName];
                if(Object.keys(sRegistry.registry[fullServiceName]["nodes"]).length === 0){
                    delete sRegistry.registry[fullServiceName];
                }
                sRegistry.removeNodeFromRegistry(fullServiceName, subNodeName);
                if(Object.keys(sRegistry.hashRegistry[fullServiceName]["nodes"]).length === 0){
                    delete sRegistry.hashRegistry[fullServiceName];
                }
            }, ((timeOut)*1000)+500);

            sRegistry.timeResetters[subNodeName] = timeResetter;
        });
        sRegistry.addChange('register', fullServiceName, nodeName, { address, metadata });
    }

    registryService = (serviceObj) => {
        let service = Service.buildByObj(serviceObj);
        if(!service || _.isNull(service)) return;
        this.registerService(service);
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
        sRegistry.addChange('deregister', serviceName, nodeName, {});
        return true;
    }
}

const registryService = new RegistryService();

module.exports = {
    registryService
}