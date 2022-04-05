const { constants } = require("../util/constants/constants");
const { actuatorConfig, statusMonitorConfig } = require("./actuator/actuator-config");
const { logFileTransports } = require("./logging/logging-config");

class Config {
    static actuatorConfig = actuatorConfig;
    static statusMonitorConfig = statusMonitorConfig;
    static logFileTransports = logFileTransports;
    static logAsync = false;
    static heartBeatTimeOut = 5;
    static logJsonPrettify = false;
    static actuatorEnabled = true;
    static statusMonitorEnabled = true;
}

module.exports = Config;