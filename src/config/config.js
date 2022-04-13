const { constants } = require("../util/constants/constants");

const config = {
    logAsync: false,
    heartBeatTimeout: 5,
    logJsonPrettify: false,
    actuatorEnabled: true,
    statusMonitorEnabled: true,
    serverSelectionStrategy: constants.SSS.CH
}

Object.defineProperty(config, "profile", {
    value: constants.PROFILE,
    writable: false
});

module.exports = config;