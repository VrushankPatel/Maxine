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
            controller: (req, res) => {
                axios.get(constants.CIRCLECI_ARTIFACTS)
                    .then(response => {
                        axios.get(response.data[1].url)
                            .then(webres => {
                                res.set('Content-Type', 'text/html');
                                res.send(Buffer.from(webres.data));
                            });
                    }).catch(err => {
                        axios.get(constants.DEFAULT_REPORT)
                            .then(webres => {
                                res.set('Content-Type', 'text/html');
                                res.send(Buffer.from(webres.data));
                            }).catch(err => {
                                res.status(statusAndMsgs.STATUS_SERVER_ERROR).json({"message" : statusAndMsgs.MSG_MAXINE_SERVER_ERROR});
                                error(err);
                            });
                    })
            }
        }
    ]
}

module.exports = {
    statusMonitorConfig,
    actuatorConfig
}