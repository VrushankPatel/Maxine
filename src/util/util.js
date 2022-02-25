const date = require('date-and-time');
const JsonBuilder = require('../builders/json-builder');
const { constants } = require('./constants/constants');


const getCurrentDate = () => date.format(new Date(), constants.REQUEST_LOG_TIMESTAMP_FORMAT);

const containsExcludedLoggingUrls = (url) => {    
    for (const excChunk in constants.LOG_EXCLUDED_URLS_CHUNKS) {
        if(url.includes(excChunk)){
            return true
        }
    }
    return false;
}
const logJsonBuilder = (logLevel, logType, httpStatus, req, msg = "") => {
    return JsonBuilder.createNewJson()
                    .put("LogLevel", logLevel)                    
                    .put("LogType", logType)                    
                    .put("Timestamp", getCurrentDate())
                    .checkNull(httpStatus)
                        .put("Status", httpStatus)
                    .endCondition()
                    .checkNull(msg)
                        .put("Message", msg)
                    .endCondition()
                    .checkNull(req)
                    .registerObj(req)
                        .putFromRegObj("Method", "method")
                        .putFromRegObj("ClientIp", "ip")
                        .putFromRegObj("Endpoint", "originalUrl")
                        .putFromRegObj("HTTPVersion", "httpVersion")
                    .deregisterObj()
                    .formatJson()
                    .getJson();
}

const closeApp = () => process.exit();

module.exports = {
    getCurrentDate,    
    containsExcludedLoggingUrls,
    logJsonBuilder,
    closeApp
}