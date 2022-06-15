const { statusAndMsgs } = require("../../util/constants/constants");
const { discoveryService } = require("../../service/discovery-service");
const _ = require('lodash');

const discoveryController = (req, res) => {
    // Retrieving the serviceName from query params
    const serviceName = req.query.serviceName;
    const ip = req.ip
    || req.connection.remoteAddress
    || req.socket.remoteAddress
    || req.connection.socket.remoteAddress;

    // if serviceName is not there, responding with error
    if(!serviceName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_DISCOVER_MISSING_DATA});
        return;
    }

    // now, retrieving the serviceNode from the registry
    const serviceNode = discoveryService.getNode(serviceName, ip);

    // no service node is there so, service unavailable is our error response.
    if(_.isEmpty(serviceNode)){
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
            "message" : statusAndMsgs.MSG_SERVICE_UNAVAILABLE
        });
        return;
    }

    res.redirect(serviceNode.address);
}

module.exports = discoveryController