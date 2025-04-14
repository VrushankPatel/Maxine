const winston = require('winston');
const { format } = require('winston');
const { constants } = require('../../util/constants/constants');

const logFileTransports = [new winston.transports.Console()]
    .concat(constants.LOGLEVELS.map(logLevel => new winston.transports.File({
        level: logLevel,
        filename: `logx/Maxine-${logLevel}.log`,
        maxsize:2000000,
        keep: 10,
        compress: true
    }))
);

let last100LogsTrack = [];

const clearRecents = () => last100LogsTrack = [""];

const getRecents = () => last100LogsTrack.join("\n\n");

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