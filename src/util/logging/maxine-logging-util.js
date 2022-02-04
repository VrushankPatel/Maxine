const fs = require('fs');
const winston = require('winston');
const { format } = require('winston');
const {constants, httpStatus} = require('../constants/constants');
const { getLoggerDate } = require('../util');

const banner = fs.readFileSync(constants.BANNERPATH, 'utf8');

const logFileTransports = [new winston.transports.Console()].concat(
    constants.LOGLEVELS.map(logLevel => new winston.transports.File({
        level: logLevel,
        filename: `logs/${logLevel}.log`,
        handleExceptions: true,
    }))
);

const buildLogger = (logName) => {
    const logConfiguration = {
        transports: logFileTransports,
        format: format.combine(
            format.label({label: `〉 ${logName} 〉`}),
            format.timestamp({format: constants.LOGTIMESTAMPFORMAT}),
            format.align(),            
            format.printf(log => `\n【 ${log.level.toUpperCase()} 】 : ${[log.timestamp]} ${log.label} ${log.message}`),
        )
    };
    return winston.createLogger(logConfiguration);
}

const logger = buildLogger("Maxine Discovery");

function logRequestAsync (req, res) {
    setTimeout(() => {
        const timeStamp = getLoggerDate();
        const logLevel = res.statusCode >= 400 ? "error" : "info";        
        logger.log(logLevel, `\n【 WEBREQUEST 】: [ ${req.ip} ] "${req.method.toUpperCase()} ${req.url} HTTP/${req.httpVersion}" [${timeStamp}:IST] ${res.statusCode}`);        
    }, 0 );    
}

const loggingUtil = {
    logger: logger,    
    initApp : () => logger.info(`\n${banner} 〉 ${constants.PROFILE} started on port : ${constants.PORT}\n`),
    logRequest: (req, res, next) => {
        logRequestAsync(req, res);
        next();
    },
    logGenericExceptions: (err, req, res, next) => {
        const timeStamp = getLoggerDate();
        logger.error(`\n【 WEBREQUEST 】: [ ${req.ip} ] "${req.method.toUpperCase()} ${req.url} HTTP/${req.httpVersion}" [${timeStamp}]:IST ${httpStatus.STATUS_SERVER_ERROR} [Error] : "${err.toString()}"`);
        res.status(httpStatus.STATUS_SERVER_ERROR).json({"message" : httpStatus.MSG_MAXINE_SERVER_ERROR});
    }
}

module.exports = loggingUtil;