const _ = require('lodash');
const { serviceRegistry } = require("../entity/service-registry");
class RegistryService{

    registerService = (serviceObj) => {
        const {serviceName, nodeName, address, timeOut, weight} = serviceObj;

        if (!serviceRegistry.registry[serviceName]){
            serviceRegistry.registry[serviceName] = {offset: 0, nodes: {}};
        }

        [...Array(weight).keys()].forEach(index => {
            const subNodeName = `${nodeName}-${index}`;

            if(serviceRegistry.registry[serviceName]["nodes"][subNodeName]){
                clearTimeout(serviceRegistry.timeResetters[serviceRegistry.registry[serviceName]["nodes"][subNodeName]["nodeName"]]);
            }

            serviceRegistry.registry[serviceName]["nodes"][subNodeName] = {
                "nodeName" : subNodeName,
                "parentNode" : nodeName,
                "address" : address,
                "timeOut" : timeOut,
                "registeredAt" : new Date().toLocaleString()
            }

            const timeResetter = setTimeout(() => {
                delete serviceRegistry.registry[serviceName]["nodes"][subNodeName];
                if(Object.keys(serviceRegistry.registry[serviceName]["nodes"]).length === 0){
                    delete serviceRegistry.registry[serviceName];
                }
            }, ((timeOut)*1000)+500);
            serviceRegistry.timeResetters[subNodeName] = timeResetter;
        });
        setTimeout(() => {
            serviceRegistry.updateHashRegistry(serviceName);
        }, ((timeOut)*1000)+500);
        serviceRegistry.updateHashRegistry(serviceName);
    }

    registryService = (serviceObj) => {
        setTimeout(this.registerService, 0, serviceObj);
        serviceObj.registeredAt = new Date().toLocaleString();
        return serviceObj;
    }
}

const registryService = new RegistryService();

module.exports = {
    registryService
}