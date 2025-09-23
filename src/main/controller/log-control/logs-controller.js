let { clearRecents, getRecents } = require('../../config/logging/logging-config');
const LogFilesService = require('../../service/logfiles-service');

const logFilesService = new LogFilesService();

const logsLinkGenController = async (_, res) => {
    console.log('logsLinkGenController called');
    try {
        const links = await logFilesService.getLogLinks();
        res.send(links);
    } catch (err) {
        console.log('error in logsLinkGenController', err);
        res.status(500).send({error: err.message});
    }
}

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