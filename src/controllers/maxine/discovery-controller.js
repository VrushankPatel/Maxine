const { registryService } = require("../../services/registry-service");
const { statusAndMsgs: httpStatus } = require("../../util/constants/constants");

const discoveryController = (req, res) => {
    // Retrieving the serviceName from query params
    const serviceName = req.query.serviceName;
    // if serviceName is not there, responding with error
    if(!serviceName) {
        res.status(httpStatus.STATUS_GENERIC_ERROR).json({"message" : httpStatus.MSG_DISCOVER_MISSING_DATA});
        return;
    }

    // now, retrieving the serviceNode from the registry
    const serviceNode = registryService.getNode(serviceName.toUpperCase());
    // if ServiceNode is there, we'll respond.
    if(serviceNode){
        res.json(serviceNode);
        return;
    }
    // no service node is there so, service unavailable is our error response.
    res.status(httpStatus.SERVICE_UNAVAILABLE).json({
        "message" : httpStatus.MSG_SERVICE_UNAVAILABLE
    });
}

module.exports = discoveryController