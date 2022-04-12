const { constants } = require("../util/constants/constants");
const _ = require('lodash');
const config = require("../config/config");

class ConfiguratorService{
    updateLoggingType(logAsync) {
        if(!_.isBoolean(logAsync)) return constants.CODE_TYPE_ERROR;
        config.logAsync = logAsync;
        return constants.CODE_SUCCESS;
    }

    updateHeartBeatTimeout(heartBeatTimeOut) {
        if(!Number.isInteger(heartBeatTimeOut)) return constants.CODE_TYPE_ERROR;
        if(heartBeatTimeOut < 1) return constants.CODE_INVALID_DATA;
        config.heartBeatTimeOut = heartBeatTimeOut;
        return constants.CODE_SUCCESS;
    }

    updateLogJsonPrettify(logJsonPrettify) {
        if(!_.isBoolean(logJsonPrettify)) return constants.CODE_TYPE_ERROR;
        config.logJsonPrettify = logJsonPrettify;
        return constants.CODE_SUCCESS;
    }

    updateServerSelectionStrategy(serverSelectionStrategy){
        const serverSelStrat = constants.SSS[serverSelectionStrategy];
        if(_.isUndefined(serverSelStrat)) return constants.CODE_INVALID_DATA;
        config.serverSelStrat = serverSelStrat;
        return constants.CODE_SUCCESS;
    }
}

module.exports = {
    ConfiguratorService
}