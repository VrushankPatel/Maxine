const { last100LogsTrack } = require('../../config/logging/logging-config');
const LogFilesService = require('../../service/logfiles-service');
const { constants } = require('../../util/constants/constants');

const logFilesService = new LogFilesService();

const logsDownloadController = (req, res) => {
    global.logLevel = req.params.level;
    const logFilePath = `${constants.LOGDIR}${logLevel}`;
    res.download(logFilePath);
}

const logsLinkGenController = (_, res) => res.send(logFilesService.getLogLinks());

const recentLogsController = (_, res) => res.status(200).json({
    "logs" : last100LogsTrack.join("\n")
});

module.exports = {
    logsDownloadController,
    logsLinkGenController,
    recentLogsController
};