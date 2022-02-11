const date = require('date-and-time');
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

const logJsonBuilder = (logLevel, logType, httpStatus, msg = "", req) => {    
    const logObject = {
        "LogLevel" : logLevel,
        "LogType" : logType,
        "Timestamp" : getCurrentDate()
    };
    if(httpStatus){
        logObject["Status"] = httpStatus;
    }
    if(req){
        logObject["Method"] = req.method.toUpperCase();
        logObject["ClientIp"] = req.ip;
        logObject["Endpoint"] = req.originalUrl;
        logObject["HTTPVersion"] = `HTTP/${req.httpVersion}`;
    }
    if(msg){
        logObject["Message"] = msg;
    }
    return JSON.stringify(JSON.parse(JSON.stringify(logObject))); // minified JSON
    // return JSON.stringify(logObject, null, "  ");    // prettified JSON
}

module.exports = {
    getCurrentDate,    
    containsExcludedLoggingUrls,
    logJsonBuilder
}