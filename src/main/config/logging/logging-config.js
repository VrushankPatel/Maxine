const winston = require('winston');
const { format } = require('winston');
const { constants } = require('../../util/constants/constants');

const logFileTransports = [new winston.transports.Console()]
    .concat(constants.LOGLEVELS.map(logLevel => new winston.transports.File({
        level: logLevel,
        filename: `logs/Maxine-${logLevel}.log`,
        maxsize:10000000,
        keep: 5,
        compress: true
    }))
);

const logConfiguration = {
    transports: logFileTransports,
    format: format.combine(
        format.printf(log => log.message),
    )
};

module.exports = {
    logConfiguration
}