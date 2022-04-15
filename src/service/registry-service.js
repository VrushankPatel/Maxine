const _ = require('lodash');
const { serviceRegistry: s_Registry } = require("../entity/service-registry");
class RegistryService{

    registerService = (serviceObj) => {
        const {serviceName, nodeName, address, timeOut, weight} = serviceObj;

        if (!s_Registry.registry[serviceName]){
            s_Registry.registry[serviceName] = {offset: 0, nodes: {}};
        }

        [...Array(weight).keys()].forEach(index => {
            const subNodeName = `${nodeName}-${index}`;

            s_Registry.addNodeToHashRegistry(serviceName, subNodeName);

            if(s_Registry.registry[serviceName]["nodes"][subNodeName]){
                clearTimeout(
                    s_Registry
                        .timeResetters[s_Registry
                                        .registry[serviceName]["nodes"][subNodeName]["nodeName"]]);
            }

            s_Registry.registry[serviceName]["nodes"][subNodeName] = {
                "nodeName" : subNodeName,
                "parentNode" : nodeName,
                "address" : address,
                "timeOut" : timeOut,
                "registeredAt" : new Date().toLocaleString()
            }

            const timeResetter = setTimeout(() => {
                delete s_Registry.registry[serviceName]["nodes"][subNodeName];
                if(Object.keys(s_Registry.registry[serviceName]["nodes"]).length === 0){
                    delete s_Registry.registry[serviceName];
                }
                s_Registry.removeNodeFromRegistry(serviceName, subNodeName);
                if(Object.keys(s_Registry.hashRegistry[serviceName]["nodes"]).length === 0){
                    delete s_Registry.hashRegistry[serviceName];
                }
            }, ((timeOut)*1000)+500);

            s_Registry.timeResetters[subNodeName] = timeResetter;
        });
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