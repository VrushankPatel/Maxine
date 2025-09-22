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
const rateLimit = require('express-rate-limit');
const swaggerDocument = loadSwaggerYAML();
const path = require("path");
const currDir = require('./conf');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
const app = ExpressAppBuilder.createNewApp()
                .addCors()
                .ifPropertyOnce("statusMonitorEnabled")
                    .use(expressStatusMonitor(statusMonitorConfig))
                .use(logRequest)
                .use(authenticationController)
                .mapStaticDir(path.join(currDir, "client"))
                .mapStaticDirWithRoute('/logs', path.join(currDir,"logs"))
                 .ifPropertyOnce("actuatorEnabled")
                     .use(actuator(actuatorConfig))
                 .use('/api', limiter, maxineApiRoutes)
                .ifPropertyOnce('profile','dev')
                    .use('/api-spec', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
                    .use('/shutdown', process.exit)
                .blockUnknownUrls()
                .use(logWebExceptions)
                .listen(constants.PORT, loggingUtil.initApp)
                .getApp();

module.exports = app;