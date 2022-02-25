const fs = require('fs');
const winston = require('winston');
const { logConfiguration } = require('../../config/configs/logging-config');
const {constants, httpStatus} = require('../constants/constants');
const { properties } = require('../propertyReader/property-reader');
const { containsExcludedLoggingUrls, logJsonBuilder, closeApp } = require('../util');

const banner = fs.readFileSync(constants.BANNERPATH, 'utf8');
const loggingType = properties["logging.type"];
const logger = winston.createLogger(logConfiguration);


const log = (logFunction) => loggingType === "async" ? setTimeout(logFunction, 0) : logFunction();

const info = (msg) => log(() => logger.info(logJsonBuilder("INFO", "GENERIC", null, null, msg)));

const error = (msg) => log(() => logger.error(logJsonBuilder("ERROR", "GENERIC", null, null, msg)));

const errorAndClose = (msg) => {
    error(msg);
    logger.on('finish', closeApp);
};

const logExceptions = (type ,req, msg) => log(() => logger.error(logJsonBuilder("ERROR", "WEBREQUEST-Exception", httpStatus.STATUS_SERVER_ERROR, req, msg)));

const logRequest = (req, res, next) => {
    log(() => {
        if(containsExcludedLoggingUrls(req.url)) return;
        const logLevel = res.statusCode >= httpStatus.STATUS_NOT_FOUND ? "ERROR" : "INFO";
        logger.info(logJsonBuilder(logLevel, "WEBREQUEST", res.statusCode, req));
    });
    next();
}

const loggingUtil = {    
    info,
    error,
    initApp : () => logger.info(`\n${banner} 〉 ${constants.PROFILE} started on port : ${constants.PORT}\n`),
    logRequest,
    logExceptions,
    errorAndClose
}

module.exports = loggingUtil;