const date = require('date-and-time');
const JsonBuilder = require('../builders/json-builder');
const { constants } = require('./constants/constants');


const getCurrentDate = () => date.format(new Date(), constants.REQUEST_LOG_TIMESTAMP_FORMAT);

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
    logJsonBuilder
}