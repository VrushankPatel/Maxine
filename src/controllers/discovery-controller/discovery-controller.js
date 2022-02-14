const { info, error } = require('../../util/logging/maxine-logging-util');
const { register } = require('../../serviceRegistry/registry');
const { httpStatus, constants } = require('../../util/constants/constants');

const discoveryController = (req, res) => {
    let {hostName, nodeName, port, serviceName, timeOut} = req.body;    
    port = parseInt(port);    
    timeOut = parseInt(timeOut) || constants.HEARTBEAT_TIMEOUT;
    if(hostName && nodeName && port && serviceName){
        register(serviceName, nodeName, `${hostName}:${port}`, timeOut);        
        const msg = `${httpStatus.MSG_SUCCESS_REGISTERED} [service : ${serviceName} | node : ${nodeName} | address : ${hostName}:${port} | ${timeOut ? "timeOut : " + timeOut + " second(s)" : "]"}`;
        info(msg);
        res.status(httpStatus.STATUS_SUCCESS).json({"message" : msg});
        return;
    }
    error(httpStatus.MSG_MISSING_DATA);
    res.status(httpStatus.STATUS_GENERIC_ERROR).json({"message" : httpStatus.MSG_MISSING_DATA});
}

module.exports = discoveryController;