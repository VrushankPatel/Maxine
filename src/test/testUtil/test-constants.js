const { constants } = require("../../main/util/constants/constants");

const TESTUSER = {
    userName: constants.DEFAULT_ADMIN_USERNAME_PWD,
    password: constants.DEFAULT_ADMIN_USERNAME_PWD,
    role: 'admin'
}

const ENDPOINTS = {
    actuator: {
        health: '/api/actuator/health',
        info: '/api/actuator/info',
        metrics: '/api/actuator/metrics'
    },
    logs: {
        download: '/api/logs/download'
    },
    maxine: {
        config: '/api/maxine/control/config',
        serviceops: {
            register: '/api/maxine/serviceops/register',
            servers: '/api/maxine/serviceops/servers',
            discover: '/api/maxine/serviceops/discover'
        },
        signin: '/api/maxine/signin'
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