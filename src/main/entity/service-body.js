const config = require("../config/config");
const { statusAndMsgs, constants } = require("../util/constants/constants");
const { error } = require("../util/logging/logging-util");

class Service{
    hostName;
    nodeName;
    serviceName;
    timeOut;
    weight;
    address;
    healthCheckPath;

    static buildByObj(obj){
        let {hostName, nodeName, port, serviceName, timeOut, weight, ssl, path, healthCheckPath} = obj;
        const service = new Service();
        service.hostName = hostName;
        service.nodeName = nodeName;
        service.serviceName = serviceName;
        service.timeOut = Math.abs(parseInt(timeOut)) || config.heartBeatTimeout;
        service.weight = Math.abs(parseInt(weight)) || 1;
        service.healthCheckPath = healthCheckPath || "";
        hostName = hostName || "";
        port = (port === undefined || port === null || (typeof port === 'string' && port.trim() === '')) ? "" : `:${port}`;
        path = path || "";
        path = path[0] === "/" ? path : "/" + path;
        path = path[path.length-1] == "/" ? path.slice(0, path.length - 1) : path;
        const httpOrS = ssl ? "https://" : "http://";
        const prefix = hostName.startsWith("http://") || hostName.startsWith("https://") ? "" : httpOrS;
        service.address = `${prefix}${hostName}${port}${path ? path : ""}`;
        return service.validate();
    }

    validate(){
        const areNotStrings = !(typeof this.hostName === 'string' && typeof this.nodeName === 'string' && typeof this.serviceName === 'string');
        const isInvalidWeight = this.weight > constants.MAX_SERVER_WEIGHT;
        const areInvalidStrings = !this.serviceName || !this.hostName || !this.nodeName;
        if(areNotStrings || isInvalidWeight || areInvalidStrings){
            error(statusAndMsgs.MSG_INVALID_SERVICE_DATA);
            return;
        }
        return this;
    }

}

module.exports = Service;
