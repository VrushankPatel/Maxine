const { statusAndMsgs } = require("../constants/constants");
const { logBuilder } = require("../util");
const { log, logger } = require("./logging-util");

const logRequest = (req, res, next) => {
    log(() => {
        const logLevel = res.statusCode >= statusAndMsgs.STATUS_NOT_FOUND ? "ERROR" : "INFO";
        logger.info(logBuilder(logLevel, "WEBREQUEST", res.statusCode, req));
    });
    next();
}

module.exports = logRequest;