const { info } = require('../../util/logging/logging-util');
const { statusAndMsgs } = require('../../util/constants/constants');
const { registryService } = require('../../service/registry-service');
const _ = require('lodash');
const Service = require('../../entity/service-body');

const registryController = (req, res) => {
    let service = Service.buildByObj(req.body);
    if(_.isString(service)){
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : service});
        return;
    }
    const serviceResponse = registryService.registryService(service);
    info(serviceResponse);
    res.status(statusAndMsgs.STATUS_SUCCESS).json(serviceResponse);
}


const serverListController = (_, res) => {
    res.type('application/json');
    res.send(JSON.stringify(registryService.getCurrentlyRegisteredServers()));
}

module.exports = {
    registryController,
    serverListController
};