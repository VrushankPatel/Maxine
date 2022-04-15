const { serviceRegistry: sRegistry } = require("../entity/service-registry");
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
                "registeredAt" : new Date().toLocaleString()
            }

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
        setTimeout(this.registerService, 0, serviceObj);
        serviceObj.registeredAt = new Date().toLocaleString();
        return serviceObj;
    }
}

const registryService = new RegistryService();

module.exports = {
    registryService
}