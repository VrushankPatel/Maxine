const config = require("../config/config");
const { statusAndMsgs, constants } = require("../util/constants/constants");
const { error } = require("../util/logging/logging-util");
const _ = require('lodash');

class Service{
    hostName;
    nodeName;
    port;
    serviceName;
    timeOut;
    weight;
    ssl;
    address;

    static buildByObj(obj){
        let {hostName, nodeName, port, serviceName, timeOut, weight, ssl} = obj;
        const service = new Service();
        service.hostName = hostName;
        service.nodeName = nodeName;
        service.port = Math.abs(parseInt(port));
        service.serviceName = serviceName;
        service.timeOut = Math.abs(parseInt(timeOut)) || config.heartBeatTimeOut;
        service.weight = Math.abs(parseInt(weight)) || 1;
        service.ssl = ssl || false;
        service.address = `${ssl ? "https" : "http"}://${hostName}:${port}`;

        return service.validate();
    }

    validate(){
        if(!(_.isString(this.hostName) && _.isString(this.nodeName) && _.isInteger(this.port) && _.isString(this.serviceName))){
            error(statusAndMsgs.MSG_REGISTER_MISSING_DATA);
            return statusAndMsgs.MSG_REGISTER_MISSING_DATA;
        }
        if(this.weight > constants.MAX_SERVER_WEIGHT){
            error(statusAndMsgs.MSG_INVALID_WEIGHT);
            return statusAndMsgs.MSG_INVALID_WEIGHT;
        }
        return this;
    }

}

module.exports = Service;