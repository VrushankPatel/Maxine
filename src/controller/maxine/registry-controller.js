const { info } = require('../../util/logging/logging-util');
const { statusAndMsgs } = require('../../util/constants/constants');
const { registryService } = require('../../service/registry-service');
const _ = require('lodash');
const Service = require('../../entity/service-body');
const { serviceRegistry } = require('../../entity/service-registry');

const registryController = (req, res) => {
    let service = Service.buildByObj(req.body);
    if(!service || _.isNull(service)){
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_INVALID_SERVICE_DATA});
        return;
    }
    const serviceResponse = registryService.registryService(service);
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