const fs = require('fs');
const { constants } = require('../util/constants/constants');

class LogFilesService{
    getLogLinks = () => {
        let linksResponse = {}
        fs.readdirSync(constants.LOGDIR).forEach(file => {
            linksResponse[file] = `/logs/${file}`;
        });
        return linksResponse;
    }
}

module.exports = LogFilesService;