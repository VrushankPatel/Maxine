const fs = require('fs');
const LogFilesService = require('../services/logFilesService');
const { constants, httpStatus } = require('../util/constants/constants');

const logFilesService = new LogFilesService();

const logsDownloadController = (req, res) => {
    global.logLevel = req.params.level;
    const logFilePath = `${constants.LOGDIR}${logLevel}`;    
    res.download(logFilePath);
}

const logsLinkGenController = (req, res) => res.send(logFilesService.getLogLinks());

module.exports = {
    logsDownloadController,
    logsLinkGenController
};