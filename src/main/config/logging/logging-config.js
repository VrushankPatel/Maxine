const winston = require('winston');
const { format } = require('winston');
const { constants } = require('../../util/constants/constants');

const logFileTransports = [new winston.transports.Console()]
    .concat(constants.LOGLEVELS.map(logLevel => new winston.transports.File({
        level: logLevel,
        filename: `logs/Maxine-${logLevel}.log`,
        maxsize:1000000,
        keep: 5,
        compress: true
    }))
    )
    .concat([new winston.transports.File({
        level: 'info',
        filename: 'logs/audit.log',
        maxsize:1000000,
        keep: 5,
        compress: true,
        format: format.combine(
            format.timestamp(),
            format.printf(log => `${log.timestamp} ${log.message}`)
        )
    })]
    );

let last100LogsTrack = [];

const getRecents = () => last100LogsTrack.join("\n");

const clearRecents = () => last100LogsTrack = [""];

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
    // exceptionHandlers: [new winston.transports.File({ filename: "logs/Maxine-exceptions.log" })],
    // rejectionHandlers: [new winston.transports.File({ filename: "logs/Maxine-rejections.log" })],
    format: format.combine(
        format.printf(log => {
            setTimeout(() => addToRecentLogs(log.message), 0);
            return log.message;
        }),
    )
};

module.exports = {
    last100LogsTrack,
    clearRecents,
    getRecents,
    logConfiguration
}