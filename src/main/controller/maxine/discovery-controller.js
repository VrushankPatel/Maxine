const { statusAndMsgs } = require("../../util/constants/constants");
const { discoveryService } = require("../../service/discovery-service");
const _ = require('lodash');
const { info } = require("../../util/logging/logging-util");

const discoveryController = async (req, res, next) => {
    try {
        const serviceName = req.query.serviceName;
        const endPoint = req.query.endPoint || "";
        const ip = req.ip
        || req.connection.remoteAddress
        || req.socket.remoteAddress
        || req.connection.socket.remoteAddress;

        if(!serviceName) {
            res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_DISCOVER_MISSING_DATA});
            return;
        }

        const serviceNode = await discoveryService.getNode(serviceName, ip);

        if(_.isEmpty(serviceNode)){
            res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
                "message" : statusAndMsgs.MSG_SERVICE_UNAVAILABLE
            });
            return;
        }
        const addressToRedirect = serviceNode.address + (endPoint.length > 0 ? (endPoint[0] == "/" ? endPoint : `/${endPoint}`) : "");
        info(`Redirecting to ${addressToRedirect}`);
        res.redirect(addressToRedirect);
    } catch (err) {
        next(err);
    }
}

module.exports = discoveryController
