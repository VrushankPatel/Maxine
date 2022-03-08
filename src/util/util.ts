const date = require('date-and-time');
var JsonBuilder = require('../builders/json-builder');
const { constants } = require('./constants/constants');


export const getCurrentDate = () => date.format(new Date(), constants.REQUEST_LOG_TIMESTAMP_FORMAT);

export const logJsonBuilder = (logLevel, logType, statusAndMsgs, req, msg = "") => {
    return JsonBuilder.createNewJson()
                    .put("LogLevel", logLevel)
                    .put("LogType", logType)
                    .put("Timestamp", getCurrentDate())
                    .checkNull(statusAndMsgs)
                        .put("Status", statusAndMsgs)
                    .endCondition()
                    .checkNull(msg)
                        .put("Message", msg)
                    .endCondition()
                    .checkNull(req)
                    .registerObj(req)
                        .putFromRegObj("method", "Method")
                        .putFromRegObj("ip", "ClientIp")
                        .putFromRegObj("originalUrl", "Endpoint")
                        .putFromRegObj("httpVersion", "HTTPVersion")
                    .deregisterObj()
                    .formatJson()
                    .getJson();
}