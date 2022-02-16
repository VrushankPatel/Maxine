const { info, error } = require('../../util/logging/maxine-logging-util');
const { registerService, getCurrentlyRegisteredServers } = require('../../serviceRegistry/registry');
const { httpStatus, constants } = require('../../util/constants/constants');

const discoveryController = (req, res) => {
    // const hostName = (req.headers['x-forwarded-for'] || req.connection.remoteAddress).replace("::ffff:","");
    
    let {hostName, nodeName, port, serviceName, timeOut} = req.body;    
    port = parseInt(port);
    timeOut = parseInt(timeOut) || constants.HEARTBEAT_TIMEOUT;
    if(!(hostName && nodeName && port && serviceName)){
        error(httpStatus.MSG_MISSING_DATA);
        res.status(httpStatus.STATUS_GENERIC_ERROR).json({"message" : httpStatus.MSG_MISSING_DATA});
        return;
    }
    registerService(serviceName, nodeName, `${hostName}:${port}`, timeOut);        
    const msg = `${httpStatus.MSG_SUCCESS_REGISTERED} [service : ${serviceName} | node : ${nodeName} | address : ${hostName}:${port} | ${timeOut ? "timeOut : " + timeOut + " second(s)" : "]"}`;
    info(msg);
    res.status(httpStatus.STATUS_SUCCESS).json({"message" : msg});    
}


const serverListController = (req, res) => {    
    res.send(JSON.stringify(getCurrentlyRegisteredServers()));
}

module.exports = {
    discoveryController,
    serverListController
};