const fs = require('fs');
const { constants, httpStatus } = require('../util/constants/constants');

class LogFilesService{
    getLogLinks = () => {
        let links = "";
        let linksResponse = {}
        fs.readdirSync(constants.LOGDIR).forEach(file => {
            linksResponse[file] = `/logs/download/${file}`;
        });
        console.log(linksResponse)
        return linksResponse;
    }
}

module.exports = LogFilesService;