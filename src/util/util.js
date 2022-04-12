const date = require('date-and-time');
const JsonBuilder = require('../builders/json-builder');
const config = require('../config/config');
const { constants } = require('./constants/constants');


const getCurrentDate = () => date.format(new Date(), constants.REQUEST_LOG_TIMESTAMP_FORMAT);

/**
 * Below object contains method to check ServerSelectionStrategy.
 */
const sssUtil = {
    isRoundRobin: () => config.serverSelectionStrategy === constants.SSS.RR,
    isConsistentHashing: () => config.serverSelectionStrategy === constants.SSS.CH,
    isRendezvousHashing: () => config.serverSelectionStrategy === constants.SSS.RH
}

function logJsonBuilder(logLevel, logType, statusAndMsgs, req, msg = ""){
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

module.exports = {
    getCurrentDate,
    logJsonBuilder,
    sssUtil
}