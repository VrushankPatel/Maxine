const config = require("../config/config");
const { statusAndMsgs, constants } = require("../util/constants/constants");
const { error } = require("../util/logging/logging-util");
const _ = require('lodash');

class Service{
    hostName;
    nodeName;
    serviceName;
    version;
    namespace;
    region;
    zone;
    timeOut;
    weight;
    address;
    metadata;

    static buildByObj(obj){
        let {hostName, nodeName, port, serviceName, version, namespace, region, zone, timeOut, weight, ssl, path, metadata, aliases} = obj;
        const service = new Service();
        service.hostName = hostName;
        service.nodeName = nodeName;
        service.serviceName = serviceName;
        service.version = version || "1.0";
        service.namespace = namespace || "default";
        service.region = region || "default";
        service.zone = zone || "default";
        service.timeOut = Math.abs(parseInt(timeOut)) || config.heartBeatTimeout;
        service.weight = Math.abs(parseInt(weight)) || 1;
        service.metadata = metadata || {};
        service.aliases = aliases || [];
        hostName = hostName || "";
        port = _.isUndefined(port) || _.isString(port) && _.isEmpty(port) ? "" : `:${port}`;
        path = path || "";
        path = path[0] === "/" ? path : "/" + path;
        path = path[path.length-1] == "/" ? path.slice(0, path.length - 1) : path;
        const httpOrS = ssl ? "https://" : "http://";
        const prefix = hostName.startsWith("http://") || hostName.startsWith("https://") ? "" : httpOrS;
        service.address = `${prefix}${hostName}${port}${path ? path : ""}`;
        return service.validate();
    }

    validate(){
        const areNotStrings = !(_.isString(this.hostName) && _.isString(this.nodeName) && _.isString(this.serviceName));
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