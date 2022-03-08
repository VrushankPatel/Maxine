const { logFilesService } = require('../services/logfiles-service');
var { constants } = require('../util/constants/constants');

const logsDownloadController = (req, res) => {
    const logFilePath = `${constants.LOGDIR}${req.params.level}`;
    res.download(logFilePath);
}

const logsLinkGenController = (req, res) => res.send(logFilesService.getLogLinks());

module.exports = {
    logsDownloadController,
    logsLinkGenController
};