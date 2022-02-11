const { info } = require("../util/logging/maxine-logging-util");

var serviceRegistry = {
   
}

module.exports = {
    register : (serviceName, nodeName, address, timeOut) => {        
        if (!serviceRegistry[serviceName]){
            serviceRegistry[serviceName] = {};
        }
        if(serviceRegistry[serviceName][nodeName]){
            clearTimeout(serviceRegistry[serviceName][nodeName]["timeResetter"]);
        }
        serviceRegistry[serviceName][nodeName] = {
            "address" : address
        }
        const timeResetter = setTimeout(() => {
            info(`Service Removed Successfully [service : ${serviceName} | node : ${nodeName} | address : ${address} | timeOut : ${timeOut} Second(s)`);
            delete serviceRegistry[serviceName][nodeName];
        }, (timeOut+1)*1000);

        serviceRegistry[serviceName][nodeName]["timeResetter"] = timeResetter;
    }
}