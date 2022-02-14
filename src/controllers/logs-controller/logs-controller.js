const fs = require('fs');
const { constants, httpStatus } = require('../../util/constants/constants');
const { error } = require('../../util/logging/maxine-logging-util');

const logsController = (req, res) => {
    global.logLevel = req.params.level;
    const logFilePath = `${constants.LOGDIR}\\${logLevel}.log`;
    fs.promises
        .access(logFilePath)
        .then(() => {
            const logFileName = `Maxine - ${logLevel.toUpperCase()} 【 ${new Date().toUTCString()} 】.log`;
            res.download(logFilePath, logFileName);
        }).catch(() => {
            const errMsg = `Requested log file (to download) could not be found : ${logLevel}.log`;            
            error(errMsg);
            res.status(httpStatus.STATUS_NOT_FOUND).json({"message": errMsg});
        });        
}

module.exports = logsController;