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
    
    let logObj2 = JsonBuilder.createNewApp()
            .map("LogLevel", logLevel)
            .map("LogType", logType)
            .map("Timestamp", getCurrentDate())
            .checkif(httpStatus)
                .map("Status", httpStatus)
            .endCondition()
            .checkif(msg)
                .map("Message", msg)
            .endCondition()
            .getJson();
        if(req){
            logObj2 = JsonBuilder.loadJson(logObj2)
                .map("Method", req.method.toUpperCase())
                .map("ClientIp", req.ip)
                .map("Endpoint", req.originalUrl)
                .map("HTTPVersion", `HTTP/${req.httpVersion}`)
                .getJson();
        }
        
    return formatJson(logObj2);
}

module.exports = {
    getCurrentDate,    
    containsExcludedLoggingUrls,
    logJsonBuilder    
}