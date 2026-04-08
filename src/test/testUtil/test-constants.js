const { constants } = require("../../main/util/constants/constants");

const TESTUSER = {
    userName: constants.DEFAULT_ADMIN_USERNAME,
    password: constants.DEFAULT_ADMIN_PASSWORD
}

const ENDPOINTS = {
    actuator: {
        health: '/api/actuator/health',
        info: '/api/actuator/info',
        metrics: '/api/actuator/metrics',
        audit: '/api/actuator/audit',
        alerts: '/api/actuator/alerts',
        cluster: '/api/actuator/cluster',
        prometheus: '/api/actuator/prometheus',
        traces: '/api/actuator/traces',
        upstreams: '/api/actuator/upstreams'
    },
    logs: {
        download: '/api/logs/download'
    },
    maxine: {
        config: '/api/maxine/control/config',
        serviceops: {
            register: '/api/maxine/serviceops/register',
            servers: '/api/maxine/serviceops/servers',
            discover: '/api/maxine/serviceops/discover',
            proxy: '/api/maxine/serviceops/proxy'
        },
        signin: '/api/maxine/signin',
        changePassword: '/api/maxine/change-password'
    }
}

const serviceDataSample = {
    "hostName": "xx.xxx.xx.xx",
    "nodeName": "node-x-10",
    "port": "8082",
    "serviceName": "dbservice",
    "ssl": true,
    "timeOut": 5,
    "weight": 10
};

const httpOrNonHttp = serviceDataSample.ssl ? "https" : "http";

module.exports = {
    testUser: TESTUSER,
    ENDPOINTS,
    serviceDataSample,
    httpOrNonHttp
}
