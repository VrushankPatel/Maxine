const { actuatorConfig, statusMonitorConfig } = require("./actuator/actuator-config");
const { logFileTransports } = require("./logging/logging-config");

module.exports = {
    actuatorConfig,
    statusMonitorConfig,
    logFileTransports
};