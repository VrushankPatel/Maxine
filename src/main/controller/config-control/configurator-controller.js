const config = require("../../config/config");
const { ConfiguratorService } = require("../../service/configurator-service");
const { statusAndMsgs, constants } = require("../../util/constants/constants");
const { info } = require("../../util/logging/logging-util");
const { auditService } = require("../../service/audit-service");
const configuratorService = new ConfiguratorService();

const configuratorController = (req, res) => {
    const {
        logAsync,
        heartBeatTimeout,
        logJsonPrettify,
        serverSelectionStrategy: serverSelStrat,
        logFormat,
        discoveryMode
    } = req.body;

    let resultObj = {};

    if(logAsync !== undefined){
        const result = configuratorService.updateLoggingType(logAsync);
        resultObj['logAsync'] = constants.CONFIG_STATUS_CODES[result.toString()];
    }

    if(heartBeatTimeout !== undefined){
        const result = configuratorService.updateHeartBeatTimeout(heartBeatTimeout);
        resultObj['heartBeatTimeout'] = constants.CONFIG_STATUS_CODES[result.toString()];
    }

    if(logJsonPrettify !== undefined){
        const result = configuratorService.updateLogJsonPrettify(logJsonPrettify);
        resultObj['logJsonPrettify'] = constants.CONFIG_STATUS_CODES[result.toString()];
    }

    if(serverSelStrat !== undefined){
        const result = configuratorService.updateServerSelectionStrategy(serverSelStrat);
        resultObj['serverSelectionStrategy'] = constants.CONFIG_STATUS_CODES[result.toString()];
    }

    if(logFormat !== undefined){
        const result = configuratorService.updateLogFormat(logFormat);
        resultObj['logFormat'] = constants.CONFIG_STATUS_CODES[result.toString()];
    }

    if(discoveryMode !== undefined){
        const result = configuratorService.updateDiscoveryMode(discoveryMode);
        resultObj['discoveryMode'] = constants.CONFIG_STATUS_CODES[result.toString()];
    }

    info(`config alter : ${JSON.stringify(resultObj)}`);
    auditService.record('config.updated', {
        outcome: 'UPDATED',
        userName: req.authUser ? req.authUser.userName : undefined,
        role: req.authUser ? req.authUser.role : undefined,
        traceId: req.traceId,
        changes: resultObj
    });
    res.status(statusAndMsgs.STATUS_SUCCESS).json(resultObj);
}

const configurationController = (_req, res) => {
    config.port = constants.PORT;
    res.json(config);
};

module.exports = {
    configuratorController,
    configurationController
};
