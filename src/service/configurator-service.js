const Config = require("../config/config");
const { constants } = require("../util/constants/constants");
const _ = require('lodash');

class ConfiguratorService{
    updateLoggingType(logAsync) {
        if(!_.isBoolean(logAsync)) return constants.CODE_TYPE_ERROR;
        Config.logAsync = logAsync;
        return constants.CODE_SUCCESS;
    }

    updateHeartBeatTimeout(heartBeatTimeOut) {
        if(!Number.isInteger(heartBeatTimeOut)) return constants.CODE_TYPE_ERROR;
        if(heartBeatTimeOut < 1) return constants.CODE_INVALID_TYPE;
        Config.heartBeatTimeOut = heartBeatTimeOut
        return constants.CODE_SUCCESS;
    }

    updateLogJsonPrettify(logJsonPrettify) {
        if(!_.isBoolean(logJsonPrettify)) return constants.CODE_TYPE_ERROR;
        Config.logJsonPrettify = logJsonPrettify;
        return constants.CODE_SUCCESS;
    }
}

module.exports = {
    ConfiguratorService
}