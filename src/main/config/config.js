const { constants } = require("../util/constants/constants");

const config = {
    logAsync: true,
    heartBeatTimeout: 5,
    logJsonPrettify: false,
    actuatorEnabled: true,
    statusMonitorEnabled: true,
    serverSelectionStrategy: constants.SSS.RR,
    logFormat: constants.LOG_FORMATS.JSON
}

Object.defineProperty(config, "profile", {
    value: constants.PROFILE,
    writable: false
});

module.exports = config;