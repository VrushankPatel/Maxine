const winston = require('winston');
const { format } = require('winston');
const { constants } = require('../../constants/constants');

const logFileTransports = [new winston.transports.Console()].concat(
    constants.LOGLEVELS.map(logLevel => new winston.transports.File({
        level: logLevel,
        filename: `logs/${logLevel}.log`,
        handleExceptions: true,
    }))
);

const logConfiguration = {
    transports: logFileTransports,
    format: format.combine(
        format.label({label: `〉 ${constants.APP_NAME} 〉`}),
        format.timestamp({format: constants.LOGTIMESTAMPFORMAT}),
        format.align(),            
        format.printf(log => `\n【 ${log.level.toUpperCase()} 】 : ${[log.timestamp]} ${log.label} ${log.message}`),
    )
};

module.exports = {    
    logConfiguration
}