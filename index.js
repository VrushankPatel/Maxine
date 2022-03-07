require('./src/util/logging/log-generic-exceptions')();
const loggingUtil = require('./src/util/logging/logging-util');
const { constants } = require('./src/util/constants/constants');
const actuator = require('express-actuator');
const AppBuilder = require('./src/builders/app-builder');
const { statusMonitorConfig, actuatorConfig } = require('./src/config/config');
const maxineApiRoutes = require('./src/routes/routes');
const expressStatusMonitor = require('express-status-monitor');
const logWebExceptions = require('./src/util/logging/log-web-exceptions');
const logRequest = require('./src/util/logging/log-request');
const authenticationFilter = require('./src/security/authentication-filter');
const { initDb } = require('./src/db/db-instance');

const app = AppBuilder.createNewApp()
                .useIfPropertyOnce(expressStatusMonitor(statusMonitorConfig), "statusMonitor.enabled")
                .use(logRequest)
                .use(authenticationFilter)
                .useIfPropertyOnce(actuator(actuatorConfig), "actuator.enabled")
                .use('/api',maxineApiRoutes)
                .blockUnknownUrls()
                .use(logWebExceptions)
                .invoke(initDb)
                .getApp();

app.listen(constants.PORT, loggingUtil.initApp);

module.exports = app;