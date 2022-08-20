require('./src/main/util/logging/log-generic-exceptions')();
const loggingUtil = require('./src/main/util/logging/logging-util');
const { constants } = require('./src/main/util/constants/constants');
const actuator = require('express-actuator');
const ExpressAppBuilder = require('./src/main/builders/app-builder');
const maxineApiRoutes = require('./src/main/routes/api-routes');
const expressStatusMonitor = require('express-status-monitor');
const logWebExceptions = require('./src/main/util/logging/log-web-exceptions');
const logRequest = require('./src/main/util/logging/log-request');
const { authenticationController } = require('./src/main/controller/security/authentication-controller');
const swaggerUi = require('swagger-ui-express');
const { statusMonitorConfig, actuatorConfig } = require('./src/main/config/actuator/actuator-config');
const { loadSwaggerYAML } = require('./src/main/util/util');
const uiRoute = require('./src/main/routes/ui-route');
const swaggerDocument = loadSwaggerYAML();
const path = require("path");

const app = ExpressAppBuilder.createNewApp()
                .addCors()
                .ifPropertyOnce("statusMonitorEnabled")
                    .use(expressStatusMonitor(statusMonitorConfig))
                .use(logRequest)
                .use(authenticationController)
                .mapStaticDir(path.join(process.cwd(),"client"))
                .mapStaticDirWithRoute('/logs', `${process.cwd()}/logs`)
                .ifPropertyOnce("actuatorEnabled")
                    .use(actuator(actuatorConfig))
                .use('/api',maxineApiRoutes)
                .use('/*',uiRoute)
                .ifPropertyOnce('profile','dev')
                    .use('/api-spec', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
                    .use('/shutdown', process.exit)
                .blockUnknownUrls()
                .use(logWebExceptions)
                .listen(constants.PORT, loggingUtil.initApp)
                .getApp();

module.exports = app;