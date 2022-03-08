import { Application } from "express";

require('./src/util/logging/log-generic-exceptions')();
var { logUtil } = require('./src/util/logging/logging-util');
var { constants } = require('./src/util/constants/constants');
const actuator = require('express-actuator');
const { ExpressBuilder } = require('./src/builders/app-builder');
var { statusMonitorConfig, actuatorConfig } = require('./src/config/config');
const { maxineApiRoutes } = require('./src/routes/routes');
const expressStatusMonitor = require('express-status-monitor');
const { logWebExceptions } = require('./src/util/logging/log-web-exceptions');
var { logRequest } = require('./src/util/logging/log-request');
const { authenticationFilter } = require('./src/security/authentication-filter');
var { initDb } = require('./src/db/db-instance');

const app:Application = ExpressBuilder.createNewApp()
                .useIfPropertyOnce(expressStatusMonitor(statusMonitorConfig), "statusMonitor.enabled")
                .use(logRequest)
                .use(authenticationFilter)
                .useIfPropertyOnce(actuator(actuatorConfig), "actuator.enabled")
                .use('/api',maxineApiRoutes)
                .blockUnknownUrls()
                .use(logWebExceptions)
                .invoke(initDb)
                .getApp();

app.listen(constants.PORT, logUtil.initApp);

module.exports = app;