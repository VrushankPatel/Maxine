require('./src/main/util/logging/log-generic-exceptions')();
const loggingUtil = require('./src/main/util/logging/logging-util');
const { constants } = require('./src/main/util/constants/constants');
const actuator = require('express-actuator');
const ExpressAppBuilder = require('./src/main/builders/app-builder');
const maxineApiRoutes = require('./src/main/routes/routes');
const expressStatusMonitor = require('express-status-monitor');
const logWebExceptions = require('./src/main/util/logging/log-web-exceptions');
const logRequest = require('./src/main/util/logging/log-request');
const { authenticationController } = require('./src/main/controller/security/authentication-controller');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const { statusMonitorConfig, actuatorConfig } = require('./src/main/config/actuator/actuator-config');
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