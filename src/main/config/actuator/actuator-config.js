const { default: axios } = require("axios")
const { constants, statusAndMsgs } = require("../../util/constants/constants")
const { error } = require("../../util/logging/logging-util");

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
        port: constants.PORT
    }]
}

const actuatorConfig = {
    basePath: constants.ACTUATORPATH,
    customEndpoints: [
        {
            id: 'performance',
            controller: (_req, res) => {
                axios.get(constants.CIRCLECI_ARTIFACTS)
                    .then(response => {
                        axios.get(response.data[1].url)
                            .then(webres => {
                                res.set('Content-Type', 'text/html');
                                res.send(Buffer.from(webres.data));
                            });
                    }).catch(_err => {
                        res.status(404).send({"message" : "Could not retrieve load test report."})
                    })
            }
        }
    ]
}

module.exports = {
    statusMonitorConfig,
    actuatorConfig
}