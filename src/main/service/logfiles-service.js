const fs = require('fs').promises;
const { constants } = require('../util/constants/constants');

class LogFilesService {
  getLogLinks = async () => {
    const linksResponse = {};
    try {
      const files = await fs.readdir(constants.LOGDIR);
      files.forEach((file) => {
        linksResponse[file] = `/logs/${file}`;
      });
    } catch (err) {
      // handle error
    }
    return linksResponse;
  };
}

module.exports = LogFilesService;
