const winston = require('winston');
const { format } = require('winston');
var { constants } = require('../../util/constants/constants');

export const logFileTransports = (constants.PROFILE === "prod" ? [] : [new winston.transports.Console()])
    .concat(constants.LOGLEVELS.map(logLevel => new winston.transports.File({
        level: logLevel,
        filename: `logs/Maxine-${logLevel}.log`,
        maxsize:10000000,
        keep: 5,
        compress: true
    }))
);

export const logConfiguration = {
    transports: logFileTransports,
    format: format.combine(
        format.printf(log => log.message),
    )
};