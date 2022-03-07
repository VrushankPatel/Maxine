const fs = require('fs');
const winston = require('winston');
const { logConfiguration } = require('../../config/logging/logging-config');

const {constants, statusAndMsgs: httpStatus} = require('../constants/constants');
const { properties } = require('../propertyReader/property-reader');
const { logJsonBuilder } = require('../util');

const banner = fs.readFileSync(constants.BANNERPATH, 'utf8');
const loggingType = properties["logging.type"];
const logger = winston.createLogger(logConfiguration);


const log = (logFunction) => loggingType === "async" ? setTimeout(logFunction, 0) : logFunction();

const info = (msg) => log(() => logger.info(logJsonBuilder("INFO", "GENERIC", null, null, msg)));

const error = (msg) => log(() => logger.error(logJsonBuilder("ERROR", "GENERIC", null, null, msg)));

const errorAndClose = (msg) => {
    logger.error(msg);
    logger.on('finish', process.exit);
};

const logExceptions = (req, msg) => log(() => logger.error(logJsonBuilder("ERROR", "WEBREQUEST-Exception", httpStatus.STATUS_SERVER_ERROR, req, msg)));

const loggingUtil = {
    info,
    logger,
    log,
    error,
    initApp : () => logger.info(`\n${banner} 〉 ${constants.PROFILE} started on port : ${constants.PORT}\n`),
    logExceptions,
    errorAndClose
}

module.exports = loggingUtil;