const { info } = require('../../util/logging/logging-util');
const { statusAndMsgs } = require('../../util/constants/constants');
const { registryService } = require('../../service/registry-service');
const { serviceRegistry } = require('../../entity/service-registry');

const registryController = (req, res) => {
    const serviceResponse = registryService.registryService(req.body);
    if(!serviceResponse){
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_INVALID_SERVICE_DATA});
    }
    info(serviceResponse);
    res.status(statusAndMsgs.STATUS_SUCCESS).json(serviceResponse);
}


const serverListController = (_req, res) => {
    res.type('application/json');
    res.send(JSON.stringify(serviceRegistry.getRegServers()));
}

module.exports = {
    registryController,
    serverListController
};