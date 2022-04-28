const config = require("../config/config");
const { statusAndMsgs, constants } = require("../util/constants/constants");
const { error } = require("../util/logging/logging-util");
const _ = require('lodash');

class Service{
    hostName;
    nodeName;
    serviceName;
    timeOut;
    weight;
    address;

    static buildByObj(obj){
        let {hostName, nodeName, port, serviceName, timeOut, weight, ssl, path} = obj;
        const service = new Service();
        service.hostName = hostName;
        service.nodeName = nodeName;
        service.serviceName = serviceName;
        service.timeOut = Math.abs(parseInt(timeOut)) || config.heartBeatTimeout;
        service.weight = Math.abs(parseInt(weight)) || 1;
        port = Math.abs(parseInt(port)) || (ssl ? 443 : 80);
        path = path || "";
        service.address = `${ssl ? "https" : "http"}://${hostName}:${port}${path ? `/${path}` : ""}`;
        return service.validate();
    }

    validate(){
        const areNotStrings = !(_.isString(this.hostName) && _.isString(this.nodeName) && _.isString(this.serviceName));
        const isInvalidWeight = this.weight > constants.MAX_SERVER_WEIGHT;
        if(areNotStrings || isInvalidWeight){
            error(statusAndMsgs.MSG_INVALID_SERVICE_DATA);
            return;
        }
        return this;
    }

}

module.exports = Service;