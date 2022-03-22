const JsonBuilder = require("../builders/json-builder");

class RegistryService{
    serviceRegistry = {};
    timeResetters = {};

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
    }

    registryService = (serviceObj) => {
        setTimeout(this.registerService, 0, serviceObj);
        serviceObj.registeredAt = new Date().toLocaleString();
        return serviceObj;
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
        const nodes = this.getNodes(serviceName) || {};
        const offset = this.getOffsetAndIncrement(serviceName) || 0;
        const keys = Object.keys(nodes);
        const key = keys[offset % keys.length];
        return nodes[key];
    }

    getServiceInfoIson = (serviceName, nodeName, statusMsg) => {
        return JsonBuilder.createNewJson()
                                .put("Status", statusMsg)
                                .put(serviceName, JsonBuilder.createNewJson()
                                                             .put(nodeName, this.serviceRegistry[serviceName]["nodes"][nodeName])
                                                             .getJson())
                                .getJson();
    }
}

const registryService = new RegistryService();

module.exports = {
    registryService
}