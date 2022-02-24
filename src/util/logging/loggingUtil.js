const fs = require('fs');
const winston = require('winston');
const { logConfiguration } = require('../../config/configs/loggingConfig');
const {constants, httpStatus} = require('../constants/constants');
const { properties } = require('../propertyReader/propertyReader');
const { containsExcludedLoggingUrls, logJsonBuilder } = require('../util');

const banner = fs.readFileSync(constants.BANNERPATH, 'utf8');
const loggingType = properties["logging.type"];
const logger = winston.createLogger(logConfiguration);


const log = (logFunction) => loggingType === "async" ? setTimeout(logFunction, 0) : logFunction();

const info = (msg) => log(() => logger.info(logJsonBuilder("INFO", "GENERIC", null, null, msg)));

const error = (msg) => log(() => logger.error(logJsonBuilder("ERROR", "GENERIC", null, null, msg)));

const logExceptions = (req, msg) => log(() => logger.error(logJsonBuilder("ERROR", "WEBREQUEST-Exception", httpStatus.STATUS_SERVER_ERROR, req, msg)));

const logGenericExceptions = () => {
    const handleUncaughts = (err) => {
        const msg = err.message + err.stack.replace(/(\r\n|\n|\r)/gm, "");        
        log(() => {
            logger.info(logJsonBuilder("ERROR", "GENERIC", null, null, msg));
            logger.on('finish', () => process.exit(1));    
        })
    };
    process.on('uncaughtException', handleUncaughts);
};

logGenericExceptions();

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
    logExceptions    
}

module.exports = loggingUtil;