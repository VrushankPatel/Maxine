const fs = require('fs');
const winston = require('winston');
const { logConfiguration } = require('../config/configs/logging-config');
const {constants, httpStatus} = require('../constants/constants');
const { getProperty } = require('../propertyReader/propertyReader');
const { getCurrentDate, containsExcludedLoggingUrls, logJsonBuilder } = require('../util');

const banner = fs.readFileSync(constants.BANNERPATH, 'utf8');
const loggingType = getProperty("logging.type");
const logger = winston.createLogger(logConfiguration);


const logSync = (logFunction) => {    
    logFunction(); 
}

const logAsync = (logFunction) => {    
    setTimeout(logFunction, 0);
}

const log = loggingType === "async" ? logAsync : logSync;

const logRequestAsync = (req, res, next) => {
    log(() => {
        if(containsExcludedLoggingUrls(req.url)) return;
        const logLevel = res.statusCode >= 400 ? "ERROR" : "INFO";
        logger.info(logJsonBuilder(logLevel, "WEBREQUEST", res.statusCode, "", req));
    });
    next();
}

const logExceptions = (err, req, res, next) => {    
    log(() => {                
        logger.error(logJsonBuilder("ERROR", "WEBREQUEST-Exception", httpStatus.STATUS_SERVER_ERROR, err.toString(), req));
    });
    res.status(httpStatus.STATUS_SERVER_ERROR).json({"message" : httpStatus.MSG_MAXINE_SERVER_ERROR});
}

const loggingUtil = {
    logger: logger,
    info: (msg) => log(() => logger.info(logJsonBuilder("INFO", "GENERIC", null, msg, null))),
    error: (msg) => log(() => logger.error(logJsonBuilder("ERROR", "GENERIC", null, msg, null))),
    initApp : () => logger.info(`\n${banner} 〉 ${constants.PROFILE} started on port : ${constants.PORT}\n`),
    logRequest: logRequestAsync,
    logGenericExceptions: logExceptions
}

module.exports = loggingUtil;