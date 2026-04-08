const { default: axios } = require("axios");
const { constants, statusAndMsgs } = require("../../util/constants/constants");
const { auditService } = require("../../service/audit-service");
const { alertService } = require("../../service/alert-service");
const { observabilityService } = require("../../service/observability-service");
const { clusterLeaderService } = require("../../service/cluster-leader-service");
const { upstreamHealthService } = require("../../service/upstream-health-service");
const { registryService } = require("../../service/registry-service");

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
            controller: async (_req, res) => {
                if (!constants.PERFORMANCE_REPORT_URL) {
                    res.status(404).json({ "message": "Performance report URL is not configured." });
                    return;
                }

                try {
                    const response = await axios.get(constants.PERFORMANCE_REPORT_URL, {
                        responseType: 'text'
                    });

                    res.set('Content-Type', 'text/html');
                    res.send(response.data);
                } catch (_err) {
                    res.status(404).json({ "message": "Could not retrieve load test report." });
                }
            }
        },
        {
            id: 'audit',
            controller: (_req, res) => {
                res.json({
                    events: auditService.getRecentEvents()
                });
            }
        },
        {
            id: 'alerts',
            controller: (_req, res) => {
                res.json({
                    alerts: alertService.getRecentAlerts()
                });
            }
        },
        {
            id: 'cluster',
            controller: (_req, res) => {
                res.json(clusterLeaderService.getStatus());
            }
        },
        {
            id: 'traces',
            controller: (_req, res) => {
                res.json({
                    traces: observabilityService.getRecentTraces()
                });
            }
        },
        {
            id: 'upstreams',
            controller: (_req, res) => {
                res.json(upstreamHealthService.getStatus());
            }
        },
        {
            id: 'prometheus',
            controller: async (_req, res) => {
                const registrySnapshot = await registryService.getRegisteredServers();
                const payload = observabilityService.renderPrometheus({
                    registrySnapshot,
                    clusterStatus: clusterLeaderService.getStatus(),
                    upstreamStatus: upstreamHealthService.getStatus()
                });
                res.set('Content-Type', 'text/plain; version=0.0.4');
                res.send(payload);
            }
        }
    ]
}

module.exports = {
    statusMonitorConfig,
    actuatorConfig
}
