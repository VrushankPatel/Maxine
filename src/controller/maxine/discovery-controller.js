const { registryService } = require("../../service/registry-service");
const { statusAndMsgs } = require("../../util/constants/constants");
const _ = require('lodash');

const discoveryController = (req, res) => {
    // Retrieving the serviceName from query params
    const serviceName = req.query.serviceName;
    // if serviceName is not there, responding with error
    if(!serviceName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_DISCOVER_MISSING_DATA});
        return;
    }

    // now, retrieving the serviceNode from the registry
    const serviceNode = registryService.getNode(serviceName.toUpperCase());

    // no service node is there so, service unavailable is our error response.
    if(_.isEmpty(serviceNode)){
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
            "message" : statusAndMsgs.MSG_SERVICE_UNAVAILABLE
        });
        return;
    }

    // if ServiceNode is there, we'll respond.
    // res.redirect(serviceNode.address);
    res.json(serviceNode);
}

module.exports = discoveryController