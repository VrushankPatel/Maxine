const config = require("../../config/config");
const { ConfiguratorService } = require("../../service/configurator-service");
const { statusAndMsgs, constants } = require("../../util/constants/constants");
const { info } = require("../../util/logging/logging-util");
const _ = require('lodash');
const configuratorService = new ConfiguratorService();

const configuratorController = (req, res) => {
    const { logAsync, heartBeatTimeout, logJsonPrettify, serverSelectionStrategy} = req.body;

    let resultObj = {};

    if(!_.isUndefined(logAsync)){
        const result = configuratorService.updateLoggingType(logAsync);
        resultObj['logAsync'] = constants.CONFIG_STATUS_CODES[String(result)];
    }

    if(!_.isUndefined(heartBeatTimeout)){
        const result = configuratorService.updateHeartBeatTimeout(heartBeatTimeout);
        resultObj['heartBeatTimeout'] = constants.CONFIG_STATUS_CODES[String(result)];
    }

    if(!_.isUndefined(logJsonPrettify)){
        const result = configuratorService.updateLogJsonPrettify(logJsonPrettify);
        resultObj['logJsonPrettify'] = constants.CONFIG_STATUS_CODES[String(result)];
    }

    if(!_.isUndefined(serverSelectionStrategy)){
        info(serverSelectionStrategy);
    }

    info(`config alter : ${JSON.stringify(resultObj)}}`);
    res.status(statusAndMsgs.STATUS_SUCCESS).json(resultObj);
}

const configurationController = (req, res) => {
    res.json(config);
}

module.exports = {
    configuratorController,
    configurationController
};