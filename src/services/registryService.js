const JsonBuilder = require("../builders/JsonBuilder");
const { httpStatus } = require("../util/constants/constants");
const { info } = require("../util/logging/loggingUtil");

class RegistryService{
    serviceRegistry = {};
    timeResetters = {};
    registryService = (serviceName, nodeName, address, timeOut) => {

        if (!this.serviceRegistry[serviceName]){
            this.serviceRegistry[serviceName] = {};
        }
    
        if(this.serviceRegistry[serviceName][nodeName]){
            clearTimeout(this.timeResetters[this.serviceRegistry[serviceName][nodeName]["id"]]);
        }
    
        const id = Date.now().toString(36);
    
        this.serviceRegistry[serviceName][nodeName] = {
            "address" : address,
            "id" : id,
            "timeOut" : timeOut,
            "registeredAt" : new Date().toLocaleString()
        }
    
        const timeResetter = setTimeout(() => {
            info(this.getServiceInfoIson(serviceName, nodeName, httpStatus.MSG_SERVICE_REMOVED));
            delete this.serviceRegistry[serviceName][nodeName];
            if(Object.keys(this.serviceRegistry[serviceName]).length === 0){
                delete this.serviceRegistry[serviceName];
            }
        }, ((timeOut)*1000)+500);
    
        this.timeResetters[id] = timeResetter;
          
        return this.getServiceInfoIson(serviceName, nodeName, httpStatus.MSG_SERVICE_REGISTERED);
    }

    getCurrentlyRegisteredServers = () => this.serviceRegistry;

    getServiceInfoIson = (serviceName, nodeName, status) => {
        return JsonBuilder.createNewJson()
                                .put("Status", status)
                                .put(serviceName, JsonBuilder.createNewJson()
                                                             .put(nodeName, this.serviceRegistry[serviceName][nodeName])
                                                             .getJson())
                                .getJson(); 
    }
}

module.exports = {
    RegistryService
}