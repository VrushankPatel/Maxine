const { constants } = require("../util/constants/constants");
const { actuatorConfig, statusMonitorConfig } = require("./actuator/actuator-config");
const { logFileTransports } = require("./logging/logging-config");

const config = {
    actuatorConfig: actuatorConfig,
    statusMonitorConfig: statusMonitorConfig,
    logFileTransports: logFileTransports,
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