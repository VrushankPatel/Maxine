const { statusAndMsgs, constants } = require("../constants/constants");
const { logBuilder } = require("../util");
const { log, logger } = require("./logging-util");
const config = require("../../config/config");

const logRequest = (req, res, next) => {
    log(() => {
        if (constants.LOG_EXPELLED_URLS.includes(req.originalUrl)) return;
        let logRequired = true;
        constants.LOG_EXPELLED_URLS.forEach(url => {
            if (req.originalUrl.startsWith(url)) {
                logRequired = false;
            }
        })
        if (config.highPerformanceMode && req.originalUrl.startsWith('/api/maxine/serviceops/discover')) {
            logRequired = false;
        }
        if (!logRequired) return;
        const logLevel = res.statusCode >= statusAndMsgs.STATUS_NOT_FOUND ? "ERROR" : "INFO";
        logger.info(logBuilder(logLevel, "WEBREQUEST", res.statusCode, req));
    });
    next();
}

module.exports = logRequest;