const fs = require('fs');
var { constants, statusAndMsgs } = require('../util/constants/constants');

class LogFilesService{
    getLogLinks = () => {
        let linksResponse = {}
        fs.readdirSync(constants.LOGDIR).forEach(file => {
            linksResponse[file] = `/api/logs/download/${file}`;
        });
        return linksResponse;
    }
}

export const logFilesService = new LogFilesService();