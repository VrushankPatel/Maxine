const LogFilesService = require('../../service/logfiles-service');
const { constants } = require('../../util/constants/constants');
const { promises: fs } = require('fs');

const logFilesService = new LogFilesService();

const logsDownloadController = (req, res) => {
    global.logLevel = req.params.level;
    const logFilePath = `${constants.LOGDIR}${logLevel}`;
    res.download(logFilePath);
}

const logsLinkGenController = (_, res) => res.send(logFilesService.getLogLinks());

module.exports = {
    logsDownloadController,
    logsLinkGenController
};