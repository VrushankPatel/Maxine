const { constants } = require("../util/constants/constants");
const config = require("../config/config");

class ConfiguratorService{
    updateLoggingType(logAsync) {
        if(typeof logAsync !== 'boolean') return constants.CODE_TYPE_ERROR;
        config.logAsync = logAsync;
        return constants.CODE_SUCCESS;
    }

    updateHeartBeatTimeout(heartBeatTimeout) {
        if(!Number.isInteger(heartBeatTimeout)) return constants.CODE_TYPE_ERROR;
        if(heartBeatTimeout < 1) return constants.CODE_INVALID_DATA;
        config.heartBeatTimeout = heartBeatTimeout;
        return constants.CODE_SUCCESS;
    }

    updateLogJsonPrettify(logJsonPrettify) {
        if(typeof logJsonPrettify !== 'boolean') return constants.CODE_TYPE_ERROR;
        config.logJsonPrettify = logJsonPrettify;
        return constants.CODE_SUCCESS;
    }

    updateServerSelectionStrategy(serverSelectionStrategy){
        const serverSelStrat = constants.SSS[serverSelectionStrategy];
        if(serverSelStrat === undefined) return constants.CODE_INVALID_DATA;
        config.serverSelectionStrategy = serverSelStrat;
        return constants.CODE_SUCCESS;
    }

    updateLogFormat(logFormat){
        const loggingFormat = constants.LOG_FORMATS[logFormat]
        if(loggingFormat === undefined) return constants.CODE_INVALID_DATA;
        config.logFormat = loggingFormat;
        return constants.CODE_SUCCESS;
    }
}

module.exports = {
    ConfiguratorService
}