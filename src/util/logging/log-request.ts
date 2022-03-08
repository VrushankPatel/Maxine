var { statusAndMsgs } = require("../constants/constants");
var { logJsonBuilder } = require("../util");
var { logUtil } = require("./logging-util");

const { log, logger } = logUtil;

const logExpressRequest = (req, res, next) => {
    log(() => {
        const logLevel = res.statusCode >= statusAndMsgs.STATUS_NOT_FOUND ? "ERROR" : "INFO";
        logger.info(logJsonBuilder(logLevel, "WEBREQUEST", res.statusCode, req));
    });
    next();
}

module.exports = {
    logRequest: logExpressRequest
};