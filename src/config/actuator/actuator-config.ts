var { constants } = require('../../util/constants/constants');

const maxineStatusMonitorConfig = {
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
        port: constants.PORT
      }]
}

const maxineSctuatorConfig = {
    basePath: constants.ACTUATORPATH,
    customEndpoints: []
}

module.exports = {
    statusMonitorConfig: maxineStatusMonitorConfig,
    actuatorConfig: maxineSctuatorConfig
}