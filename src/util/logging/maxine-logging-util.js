const fs = require('fs');
const winston = require('winston');
const { logConfiguration } = require('../config/configs/logging-config');
const {constants, httpStatus} = require('../constants/constants');
const { getCurrentDate, containsExcludedLoggingUrls } = require('../util');

const banner = fs.readFileSync(constants.BANNERPATH, 'utf8');

const logger = winston.createLogger(logConfiguration);

logAsync = (logFunction) => {
    setTimeout(logFunction, 0);
    // logFunction(); // synchronous manner
}

logRequestAsync = (req, res, next) => {    
    logAsync(() => {        
        if(containsExcludedLoggingUrls(req.url)) return;        
        const logObject = {
            "LogLevel" : "INFO",
            "LogType" : "WEBREQUEST",
            "Method" : req.method.toUpperCase(),
            "ClientIp" : req.ip,
            "Endpoint" : req.url,
            "HTTPVersion" : `HTTP/${req.httpVersion}`,
            "Timestamp" : getCurrentDate(),
            "Status" : res.statusCode
        };
        logger.info(JSON.stringify(logObject, null, "  "));
    });
    next();
}

logExceptions = (err, req, res, next) => {
    logAsync(() => {
        const logObject = {
            "LogLevel" : "ERROR",
            "LogType" : "WEBREQUEST-Exception",
            "Method" : req.method.toUpperCase(),
            "ClientIp" : req.ip,
            "Endpoint" : req.url,
            "HTTPVersion" : `HTTP/${req.httpVersion}`,
            "Timestamp" : getCurrentDate(),
            "Status" : httpStatus.STATUS_SERVER_ERROR,
            "Error" : err.toString()
        };        
        logger.error(JSON.stringify(logObject, null, "  "));
    });
    res.status(httpStatus.STATUS_SERVER_ERROR).json({"message" : httpStatus.MSG_MAXINE_SERVER_ERROR});
}

const loggingUtil = {
    logger: logger,    
    initApp : () => logger.info(`\n${banner} 〉 ${constants.PROFILE} started on port : ${constants.PORT}\n`),
    logRequest: logRequestAsync,
    logGenericExceptions: logExceptions
}

module.exports = loggingUtil;