const { ConfiguratorService } = require("../../service/configurator-service");
const { statusAndMsgs, constants } = require("../../util/constants/constants");
const { info } = require("../../util/logging/logging-util");

const configuratorService = new ConfiguratorService();

const configuratorController = (req, res) => {
    const { logAsync, heartBeatTimeout, logJsonPrettify, serverSelectionStrategy} = req.body;

    let resultObj = {
        updateStatus: {},
        statusCodes : {
            0 : "Success",
            1 : "Type Error",
            2 : "Wrong value Or Invalid value"
        }
    };

    if(logAsync != null){
        const result = configuratorService.updateLoggingType(logAsync);
        resultObj['updateStatus']['logAsync'] = result;
    }

    if(heartBeatTimeout != null){
        const result = configuratorService.updateHeartBeatTimeout(heartBeatTimeout);
        resultObj['updateStatus']['heartBeatTimeout'] = result;
    }

    if(logJsonPrettify != null){
        const result = configuratorService.updateLogJsonPrettify(logJsonPrettify);
        resultObj['updateStatus']['logJsonPrettify'] = result;
    }

    if(serverSelectionStrategy != null){
        console.log(serverSelectionStrategy);
    }
    info(`config alter : ${JSON.stringify(resultObj)}}`);
    res.status(statusAndMsgs.STATUS_SUCCESS).json(resultObj);
}

module.exports = {
    configuratorController
};