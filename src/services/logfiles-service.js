const fs = require('fs');
const { constants, statusAndMsgs: httpStatus } = require('../util/constants/constants');

class LogFilesService{
    getLogLinks = () => {
        let linksResponse = {}
        fs.readdirSync(constants.LOGDIR).forEach(file => {
            linksResponse[file] = `/api/logs/download/${file}`;
        });
        return linksResponse;
    }
}

module.exports = LogFilesService;