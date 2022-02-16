const date = require('date-and-time');
const JsonBuilder = require('../builders/JsonBuilder');
const { constants } = require('./constants/constants');
const { properties } = require('./propertyReader/propertyReader');


const getCurrentDate = () => date.format(new Date(), constants.REQUEST_LOG_TIMESTAMP_FORMAT);

const containsExcludedLoggingUrls = (url) => {    
    for (const excChunk in constants.LOG_EXCLUDED_URLS_CHUNKS) {
        if(url.includes(excChunk)){
            return true
        }
    }
    return false;
}

const returnJsonMinified = (jsonObj) => JSON.stringify(JSON.parse(JSON.stringify(jsonObj)));

const returnJsonPrettyfied = (jsonObj) => JSON.stringify(jsonObj, null, "  ");

const formatJson = properties["log.json.prettify"] === 'true' ? returnJsonPrettyfied : returnJsonMinified;

const logJsonBuilder = (logLevel, logType, httpStatus, msg = "", req) => {        
    let logObj = JsonBuilder.createNewJson()
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
                    .getJson();        
    return formatJson(logObj);
}

module.exports = {
    getCurrentDate,    
    containsExcludedLoggingUrls,
    logJsonBuilder    
}