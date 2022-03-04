const { httpStatus } = require("../constants/constants");
const { logJsonBuilder } = require("../util");
const { log, logger } = require("./logging-util");

const logRequest = (req, res, next) => {
    log(() => {
        const logLevel = res.statusCode >= httpStatus.STATUS_NOT_FOUND ? "ERROR" : "INFO";
        logger.info(logJsonBuilder(logLevel, "WEBREQUEST", res.statusCode, req));
    });
    next();
}

module.exports = logRequest;