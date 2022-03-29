const { actuatorConfig, statusMonitorConfig } = require("./actuator/actuator-config");
const { logFileTransports } = require("./logging/logging-config");

const config = {
    actuatorConfig,
    statusMonitorConfig,
    logFileTransports,
    loggingType: "sync",
    heartBeatTimeOut: 5,
    logJsonPrettify: false,
    actuatorEnabled: true,
    statusMonitorEnabled: true,
};

module.exports = config;