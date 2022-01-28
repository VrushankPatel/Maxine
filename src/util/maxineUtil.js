const fs = require('fs');
const constants = require('./constants/constants');

module.exports = {
    createLogDirIfDoesNotExists : () => {
        !fs.existsSync(constants.LOGDIR) && fs.mkdirSync(constants.LOGDIR);
    }
};