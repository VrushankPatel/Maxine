let { clearRecents, getRecents } = require('../../config/logging/logging-config');
const LogFilesService = require('../../service/logfiles-service');

const logFilesService = new LogFilesService();

const logsLinkGenController = (_, res) => res.send(logFilesService.getLogLinks());

const recentLogsController = (_, res) => res.status(200).json({
    "logs" : getRecents()
});

const recentLogsClearController = (_, res) => {
    clearRecents();
    res.status(200).send();
};

module.exports = {
    recentLogsClearController,
    recentLogsController,
    logsLinkGenController
};