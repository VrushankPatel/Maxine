const winston = require('winston');
const config = require('../../config/config');
const { logConfiguration } = require('../../config/logging/logging-config');
const { constants, statusAndMsgs } = require('../constants/constants');
const BANNER = require('../constants/banner');
const { logBuilder } = require('../util');
const logger = winston.createLogger(logConfiguration);

const log = (logFunction) => {
  if (config.highPerformanceMode || config.noLogging) return;
  return config.logAsync === true ? setTimeout(logFunction, 0) : logFunction();
};

const info = (msg) => log(() => logger.info(logBuilder('INFO', 'GENERIC', null, null, msg)));

const audit = (msg, details = {}) => {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    event: 'AUDIT',
    message: msg,
    ...details,
  };
  log(() => logger.info(JSON.stringify(auditEntry)));
}; // for audit log

const error = (msg) => log(() => logger.error(logBuilder('ERROR', 'GENERIC', null, null, msg)));

const errorAndClose = (msg) => {
  logger.error(logBuilder('ERROR', 'GENERIC', null, null, msg));
  process.exit();
};

const consoleLog = (...args) => {
  if (!config.noLogging) {
    // console.log(...args); // Removed for performance
  }
};

const consoleError = (...args) => {
  if (!config.noLogging) {
    console.error(...args);
  }
};

const logExceptions = (req, msg) =>
  log(() =>
    logger.error(
      logBuilder('ERROR', 'WEBREQUEST-Exception', statusAndMsgs.STATUS_SERVER_ERROR, req, msg)
    )
  );

const loggingUtil = {
  info,
  audit,
  logger,
  log,
  error,
  initApp: () =>
    logger.info(`\n${BANNER} » ${constants.PROFILE} server started on port : ${constants.PORT}\n`),
  logExceptions,
  errorAndClose,
  consoleLog,
  consoleError,
};

module.exports = loggingUtil;
