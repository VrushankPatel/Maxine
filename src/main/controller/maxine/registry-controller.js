const { info } = require('../../util/logging/logging-util');
const { statusAndMsgs } = require('../../util/constants/constants');
const { registryService } = require('../../service/registry-service');

const registryController = async (req, res, next) => {
    try {
        const serviceResponse = await registryService.registryService(req.body);
        if(!serviceResponse){
            res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_INVALID_SERVICE_DATA});
            return;
        }
        info(serviceResponse);
        res.status(statusAndMsgs.STATUS_SUCCESS).json(serviceResponse);
    } catch (err) {
        next(err);
    }
}


const serverListController = async (_req, res, next) => {
    try {
        res.json(await registryService.getRegisteredServers());
    } catch (err) {
        next(err);
    }
}

module.exports = {
    registryController,
    serverListController
};
