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

let last100LogsTrack = [];

const addToRecentLogs = (message) => {
    setTimeout(() => {
        if (last100LogsTrack.length == 100){
            last100LogsTrack.shift();
        }
        last100LogsTrack.push(message);
    }, 0);
}

const logConfiguration = {
    transports: logFileTransports,
    format: format.combine(
        format.printf(log => {
            addToRecentLogs(log.message);
            return log.message;
        }),
    )
};

module.exports = {
    last100LogsTrack,
    logConfiguration
}