const { constants } = require("../../src/util/constants/constants");

const TESTUSER = {
    userName: constants.DEFAULT_ADMIN_USERNAME_PWD,
    password: constants.DEFAULT_ADMIN_USERNAME_PWD
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

const dateSample = new Date(Date.parse('12 Feb 2022 09:23:34 GMT'));
module.exports = {
    testUser: TESTUSER,
    ENDPOINTS,
    dateSample
}