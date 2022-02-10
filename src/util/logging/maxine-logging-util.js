const fs = require('fs');
const winston = require('winston');
const { logConfiguration } = require('../config/configs/logging-config');
const {constants, httpStatus} = require('../constants/constants');
const { getCurrentDate, containsExcludedLoggingUrls } = require('../util');

const banner = fs.readFileSync(constants.BANNERPATH, 'utf8');

const logger = winston.createLogger(logConfiguration);

logAsync = (logFunction) => {
    setTimeout(logFunction, 0);
    // logFunction(); // synchronous manner
}

logRequestAsync = (req, res, next) => {    
    logAsync(() => {        
        if(containsExcludedLoggingUrls(req.url)) return;
        
        logger.log("info",`\n【 WEBREQUEST 】: [ ${req.ip} ] "${req.method.toUpperCase()} ${req.url} HTTP/${req.httpVersion}" [${getCurrentDate()}] `);
        //satus code can not be logged since we're using async logging : ${res.statusCode}
    });
    next();
}

logExceptions = (err, req, res, next) => {
    logAsync(() => {
        logger.error(`\n【 WEBREQUEST-Exception 】: [ ${req.ip} ] "${req.method.toUpperCase()} ${req.url} HTTP/${req.httpVersion}" [${getCurrentDate()}] ${httpStatus.STATUS_SERVER_ERROR} [Error] : "${err.toString()}"`);
    });
    res.status(httpStatus.STATUS_SERVER_ERROR).json({"message" : httpStatus.MSG_MAXINE_SERVER_ERROR});
}

const loggingUtil = {
    logger: logger,    
    initApp : () => logger.info(`\n${banner} 〉 ${constants.PROFILE} started on port : ${constants.PORT}\n`),
    logRequest: logRequestAsync,
    logGenericExceptions: logExceptions
}

module.exports = loggingUtil;