const fs = require('fs');
const winston = require('winston');
const { logConfiguration } = require('../../config/logging/logging-config');

var {constants, statusAndMsgs} = require('../constants/constants');
var properties = require('../propertyReader/property-reader');
var { logJsonBuilder } = require('../util');

const banner = fs.readFileSync(constants.BANNERPATH, 'utf8');
const loggingType = properties["logging.type"];

const logger = winston.createLogger(logConfiguration);

const log = (logFunction) => loggingType === "async" ? setTimeout(logFunction, 0) : logFunction();

const info = (msg) => log(() => logger.info(logJsonBuilder("INFO", "GENERIC", null, null, msg)));

const error = (msg) => log(() => logger.error(logJsonBuilder("ERROR", "GENERIC", null, null, msg)));

const errorAndClose = (msg) => {
    logger.error(logJsonBuilder("ERROR", "GENERIC", null, null, msg));
    process.exit();
};

const logMaxineExceptions = (req, msg) => log(() => logger.error(logJsonBuilder("ERROR", "WEBREQUEST-Exception", statusAndMsgs.STATUS_SERVER_ERROR, req, msg)));

export const logUtil = {
    info,
    logger,
    log,
    error,
    initApp : () => logger.info(`\n${banner} 〉 ${constants.PROFILE} server started on port : ${constants.PORT}\n`),
    logExceptions: logMaxineExceptions,
    errorAndClose
}