require('./src/util/logging/log-generic-exceptions')();
var logUtil = require('./src/util/logging/logging-util').logUtil;
var constants = require('./src/util/constants/constants').constants;
var actuator = require('express-actuator');
var ExpressBuilder = require('./src/builders/app-builder').ExpressBuilder;
var _a = require('./src/config/config'), statusMonitorConfig = _a.statusMonitorConfig, actuatorConfig = _a.actuatorConfig;
var maxineApiRoutes = require('./src/routes/routes').maxineApiRoutes;
var expressStatusMonitor = require('express-status-monitor');
var logWebExceptions = require('./src/util/logging/log-web-exceptions').logWebExceptions;
var logRequest = require('./src/util/logging/log-request').logRequest;
var authenticationFilter = require('./src/security/authentication-filter').authenticationFilter;
var initDb = require('./src/db/db-instance').initDb;
var app = ExpressBuilder.createNewApp()
    .useIfPropertyOnce(expressStatusMonitor(statusMonitorConfig), "statusMonitor.enabled")
    .use(logRequest)
    .use(authenticationFilter)
    .useIfPropertyOnce(actuator(actuatorConfig), "actuator.enabled")
    .use('/api', maxineApiRoutes)
    .blockUnknownUrls()
    .use(logWebExceptions)
    .invoke(initDb)
    .getApp();
app.listen(constants.PORT, logUtil.initApp);
module.exports = app;
