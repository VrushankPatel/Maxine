const date = require('date-and-time');
const JsonBuilder = require('../builders/json-builder');
const config = require('../config/config');
const { constants } = require('./constants/constants');
const _ = require('lodash');

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
    return JsonBuilder.createNewJson()
                    .put("LogLevel", logLevel)
                    .put("LogType", logType)
                    .put("Timestamp", getCurrentDate())
                    .putIfNotNull("Status", statusAndMsgs)
                    .putIfNotNullOrEmpty("Message", msg)
                    .checkIfNull(req)
                        .registerObj(req)
                            .putFromRegObj("method", "Method")
                            .putFromRegObj("ip", "ClientIp")
                            .putFromRegObj("originalUrl", "Endpoint")
                            .putFromRegObj("httpVersion", "HTTPVersion")
                        .deregisterObj()
                    .endCondition()
                    .formatJson()
                    .getJson();
}

function plainLogBuilder(logLevel, logType, statusAndMsgs, req, msg = ""){
    let log = ` 【${logLevel}】-`;
    log = log.concat(`【${logType}】`);
    if(statusAndMsgs) log = log.concat(`| ${statusAndMsgs} `);
    if(req){
        log = log
                .concat(`| ${req.method} |`)
                .concat(` ${req.ip} |`)
                .concat(` [ ${req.originalUrl} ] |`)
                .concat(` HTTP/${req.httpVersion} |`)
                .concat(` [ ${new Date().toUTCString()} ] `);
    }
    if(!_.isEmpty(msg)) log = log.concat(` | ${JSON.stringify(msg)} |`);
    return log;
}

const logBuilder = (...args) => {
    return logFormatChecker.isJsonFormat() ? jsonLogBuilder(...args) : plainLogBuilder(...args);
};

module.exports = {
    getCurrentDate,
    logBuilder,
    sssChecker,
    logFormatChecker
}