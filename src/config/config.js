const { ServerSelectionStrategy } = require("../entity/server-selection-strategy");
const { constants } = require("../util/constants/constants");
const config = {
    logAsync: false,
    heartBeatTimeOut: 5,
    logJsonPrettify: false,
    actuatorEnabled: true,
    statusMonitorEnabled: true
}

Object.defineProperty(config, "profile", {
    value: constants.PROFILE,
    writable: false
});

module.exports = config;