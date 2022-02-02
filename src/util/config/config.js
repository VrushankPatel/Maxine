const { constants } = require("../constants/constants");

const envVars = process.env;
const port = parseInt(envVars.PORT) || 8080;

const statusMonitorConfig = {
    title: constants.STATUSMONITORTITLE,
    path: constants.ACTUATORPATH + '/status',
    socketPath: '/socket.io',
    spans: [{interval: 1, retention: 60}, {interval: 5,retention: 60}, {interval: 15,retention: 60}, {interval: 30,retention: 60}],
    chartVisibility: {
        cpu: true,mem: true, load: true, rps: true, statusCodes: true, eventLoop: true, heap: true, responseTime: true
    },
    healthChecks: [{
        protocol: 'http',
        host: 'localhost',
        path: constants.ACTUATORPATH + '/health',
        port: port
      }]
}

const actuatorConfig = {
    basePath: constants.ACTUATORPATH,
    customEndpoints: []
}

module.exports = {    
    port,
    actuatorConfig,
    statusMonitorConfig
};