const date = require('date-and-time');
const JsonBuilder = require('../builders/json-builder');
const config = require('../config/config');
const { constants } = require('./constants/constants');
const YAML = require('yamljs');

const getCurrentDate = () => date.format(new Date(), constants.REQUEST_LOG_TIMESTAMP_FORMAT);

/**
 * Below object contains method to check ServerSelectionStrategy.
 */
const sssChecker = {
    isRoundRobin: () => config.serverSelectionStrategy === constants.SSS.RR,
    isConsistentHashing: () => config.serverSelectionStrategy === constants.SSS.CH,
    isRendezvousHashing: () => config.serverSelectionStrategy === constants.SSS.RH
}

const logFormatChecker = {
    isJsonFormat: () => config.logFormat === constants.LOG_FORMATS.JSON,
    isPlainFormat: () => config.logFormat === constants.LOG_FORMATS.PLAIN
}

function jsonLogBuilder(logLevel, logType, statusAndMsgs, req, msg = ""){
    const logObj = {
        LogLevel: logLevel,
        LogType: logType,
        Timestamp: getCurrentDate()
    };
    if (statusAndMsgs !== null && statusAndMsgs !== undefined) {
        logObj.Status = statusAndMsgs;
    }
    if (msg) {
        logObj.Message = msg;
    }
    if (req) {
        logObj.Method = req.method;
        logObj.ClientIp = req.ip;
        logObj.Endpoint = req.originalUrl;
        logObj.HTTPVersion = req.httpVersion;
    }
    return JSON.stringify(logObj);
}

function plainLogBuilder(logLevel, logType, statusAndMsgs, req, msg = ""){
    let log = `【${logLevel}】-`;
    log = log.concat(`【${logType}】`);
    if(statusAndMsgs) log = log.concat(`| ${statusAndMsgs} `);
    if(req){
        log = log
                .concat(`| ${req.method} |`)
                .concat(` ${req.ip} |`)
                .concat(` [ ${req.originalUrl} ] |`)
                .concat(` HTTP/${req.httpVersion} |`);
    }
    if(msg) log = log.concat(` | ${JSON.stringify(msg)} |`);
    log = log.concat(` [ ${new Date().toUTCString()} ] `);
    return log;
}

const logBuilder = (...args) => {
    return logFormatChecker.isJsonFormat() ? jsonLogBuilder(...args) : plainLogBuilder(...args);
};

const loadSwaggerYAML = () => {
    try{
        return YAML.load(constants.SWAGGER_PATH);
    }catch(e){}
}

module.exports = {
    getCurrentDate,
    logBuilder,
    sssChecker,
    logFormatChecker,
    loadSwaggerYAML
}