const { info } = require("../util/logging/maxine-logging-util");

let serviceRegistry = {};
let timeResetters = {};

const registerService = (serviceName, nodeName, address, timeOut) => {

    if (!serviceRegistry[serviceName]){
        serviceRegistry[serviceName] = {};
    }

    if(serviceRegistry[serviceName][nodeName]){
        clearTimeout(timeResetters[serviceRegistry[serviceName][nodeName]["id"]]);
    }

    const id = Date.now().toString(36);

    serviceRegistry[serviceName][nodeName] = {
        "address" : address,
        "id" : id,
        "timeOut" : timeOut,
        "registeredAt" : new Date().toLocaleString()
    }

    const timeResetter = setTimeout(() => {
        info(`Service Removed Successfully [service : ${serviceName} | node : ${nodeName} | address : ${address} | timeOut : ${timeOut} Second(s)`);
        delete serviceRegistry[serviceName][nodeName];
        if(Object.keys(serviceRegistry[serviceName]).length === 0){
            delete serviceRegistry[serviceName];
        }
    }, ((timeOut)*1000)+500);

    timeResetters[id] = timeResetter;
    return serviceRegistry[serviceName][nodeName];
}

const getCurrentlyRegisteredServers = () => serviceRegistry;

module.exports = {
    registerService,
    getCurrentlyRegisteredServers
}