require('./src/util/logging/log-generic-exceptions')();
const loggingUtil = require('./src/util/logging/logging-util');
const { constants } = require('./src/util/constants/constants');
const actuator = require('express-actuator');
const ExpressAppBuilder = require('./src/builders/app-builder');
const maxineApiRoutes = require('./src/routes/routes');
const expressStatusMonitor = require('express-status-monitor');
const logWebExceptions = require('./src/util/logging/log-web-exceptions');
const logRequest = require('./src/util/logging/log-request');
const { authenticationController } = require('./src/controller/security/authentication-controller');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const { statusMonitorConfig, actuatorConfig } = require('./src/config/actuator/actuator-config');
const swaggerDocument = YAML.load('./api-specs/swagger.yaml');

const app = ExpressAppBuilder.createNewApp()
                .ifPropertyOnce("statusMonitorEnabled")
                    .use(expressStatusMonitor(statusMonitorConfig))
                .use(logRequest)
                .use(authenticationController)
                .ifPropertyOnce("actuatorEnabled")
                    .use(actuator(actuatorConfig))
                .use('/api',maxineApiRoutes)
                .ifPropertyOnce('profile','dev')
                    .use('/api-spec', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
                .blockUnknownUrls()
                .use(logWebExceptions)
                .listen(constants.PORT, loggingUtil.initApp)
                .getApp();

module.exports = app;