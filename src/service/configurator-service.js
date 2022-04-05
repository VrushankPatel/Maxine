const Config = require("../config/Config");
const { constants } = require("../util/constants/constants");
const _ = require('lodash');

class ConfiguratorService{
    updateLoggingType(logAsync) {
        console.log(Config.logAsync);
        let res = !_.isBoolean(logAsync) ? constants.CODE_TYPE_ERROR : (Config.logAsync = (logAsync ? constants.YES : constants.NO)) && constants.CODE_SUCCESS;
        console.log(Config.logAsync);
        return res;
    }

    updateHeartBeatTimeout(heartBeatTimeOut) {
        return !Number.isInteger(heartBeatTimeOut) ? constants.CODE_TYPE_ERROR :
                heartBeatTimeOut < constants.CODE_TYPE_ERROR ? constants.CODE_INVALID_TYPE :
                (Config.heartBeatTimeOut = heartBeatTimeOut) && constants.CODE_SUCCESS;
    }

    updateLogJsonPrettify(logJsonPrettify) {
        return !_.isBoolean(logJsonPrettify) ? constants.CODE_TYPE_ERROR : (Config.logJsonPrettify = logJsonPrettify ? constants.YES : constants.NO) && constants.CODE_SUCCESS;
    }
}

module.exports = {
    ConfiguratorService
}