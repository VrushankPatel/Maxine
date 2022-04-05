require('./src/util/logging/log-generic-exceptions')();
const loggingUtil = require('./src/util/logging/logging-util');
const { constants } = require('./src/util/constants/constants');
const actuator = require('express-actuator');
const ExpressAppBuilder = require('./src/builders/app-builder');
const { statusMonitorConfig, actuatorConfig } = require('./src/config/config');
const maxineApiRoutes = require('./src/routes/routes');
const expressStatusMonitor = require('express-status-monitor');
const logWebExceptions = require('./src/util/logging/log-web-exceptions');
const logRequest = require('./src/util/logging/log-request');
const { authenticationController } = require('./src/controller/security/authentication-controller');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./api-docs/swagger.yaml');

const app = ExpressAppBuilder.createNewApp()
                .useIfPropertyOnce(expressStatusMonitor(statusMonitorConfig), "statusMonitorEnabled")
                .use(logRequest)
                .use(authenticationController)
                .useIfPropertyOnce(actuator(actuatorConfig), "actuatorEnabled")
                .use('/api',maxineApiRoutes)
                .use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
                .blockUnknownUrls()
                .use(logWebExceptions)
                .getApp();

app.listen(constants.PORT, loggingUtil.initApp);

module.exports = app;