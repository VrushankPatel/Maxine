const fs = require('fs');
const winston = require('winston');
const Config = require('../../config/Config');
const { logConfiguration } = require('../../config/logging/logging-config');

const {constants, statusAndMsgs} = require('../constants/constants');
const { logJsonBuilder } = require('../util');

const banner = fs.readFileSync(constants.BANNERPATH, 'utf8');
const logger = winston.createLogger(logConfiguration);


const log = (logFunction) => Config.logAsync === constants.YES ? setTimeout(logFunction, 0) : logFunction();

const info = (msg) => log(() => logger.info(logJsonBuilder("INFO", "GENERIC", null, null, msg)));

const error = (msg) => log(() => logger.error(logJsonBuilder("ERROR", "GENERIC", null, null, msg)));

const errorAndClose = (msg) => {
    logger.error(logJsonBuilder("ERROR", "GENERIC", null, null, msg));
    process.exit();
};

const logExceptions = (req, msg) => log(() => logger.error(logJsonBuilder("ERROR", "WEBREQUEST-Exception", statusAndMsgs.STATUS_SERVER_ERROR, req, msg)));

const loggingUtil = {
    info,
    logger,
    log,
    error,
    initApp : () => logger.info(`\n${banner} » ${constants.PROFILE} server started on port : ${constants.PORT}\n`),
    logExceptions,
    errorAndClose
}

module.exports = loggingUtil;