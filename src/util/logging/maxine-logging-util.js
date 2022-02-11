const fs = require('fs');
const winston = require('winston');
const { logConfiguration } = require('../config/configs/logging-config');
const {constants, httpStatus} = require('../constants/constants');
const { getCurrentDate, containsExcludedLoggingUrls, logJsonBuilder } = require('../util');

const banner = fs.readFileSync(constants.BANNERPATH, 'utf8');

const logger = winston.createLogger(logConfiguration);

logAsync = (logFunction) => {
    setTimeout(logFunction, 0);
    // logFunction(); // synchronous manner
}

logRequestAsync = (req, res, next) => {
    logAsync(() => {
        if(containsExcludedLoggingUrls(req.url)) return;
        const logLevel = res.statusCode >= 400 ? "ERROR" : "INFO";
        logger.info(logJsonBuilder(logLevel, "WEBREQUEST", res.statusCode, "", req));
    });
    next();
}

logExceptions = (err, req, res, next) => {    
    logAsync(() => {                
        logger.error(logJsonBuilder("ERROR", "WEBREQUEST-Exception", httpStatus.STATUS_SERVER_ERROR, err.toString(), req));
    });
    res.status(httpStatus.STATUS_SERVER_ERROR).json({"message" : httpStatus.MSG_MAXINE_SERVER_ERROR});
}

const loggingUtil = {
    logger: logger,
    info: (msg) => logAsync(() => logger.info(logJsonBuilder("INFO", "GENERIC", null, msg, null))),
    error: (msg) => logAsync(() => logger.error(logJsonBuilder("ERROR", "GENERIC", null, msg, null))),
    initApp : () => logger.info(`\n${banner} 〉 ${constants.PROFILE} started on port : ${constants.PORT}\n`),
    logRequest: logRequestAsync,
    logGenericExceptions: logExceptions
}

module.exports = loggingUtil;