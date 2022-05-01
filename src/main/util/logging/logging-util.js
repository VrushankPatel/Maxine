const winston = require('winston');
const config = require('../../config/config');
const { logConfiguration } = require('../../config/logging/logging-config');
const {constants, statusAndMsgs} = require('../constants/constants');
const BANNER = require('../constants/banner');
const { logBuilder } = require('../util');
const logger = winston.createLogger(logConfiguration);


const log = (logFunction) => config.logAsync === true ? setTimeout(logFunction, 0) : logFunction();

const info = (msg) => log(() => logger.info(logBuilder("INFO", "GENERIC", null, null, msg)));

const error = (msg) => log(() => logger.error(logBuilder("ERROR", "GENERIC", null, null, msg)));

const errorAndClose = (msg) => {
    logger.error(logBuilder("ERROR", "GENERIC", null, null, msg));
    process.exit();
};

const logExceptions = (req, msg) => log(() => logger.error(logBuilder("ERROR", "WEBREQUEST-Exception", statusAndMsgs.STATUS_SERVER_ERROR, req, msg)));

const loggingUtil = {
    info,
    logger,
    log,
    error,
    initApp : () => logger.info(`\n${BANNER} » ${constants.PROFILE} server started on port : ${constants.PORT}\n`),
    logExceptions,
    errorAndClose
}

module.exports = loggingUtil;