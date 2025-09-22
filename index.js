require('./src/main/util/logging/log-generic-exceptions')();
const cluster = require('cluster');
const os = require('os');
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
const compression = require('compression');
const swaggerDocument = loadSwaggerYAML();
const { healthService } = require('./src/main/service/health-service');
const config = require('./src/main/config/config');
const path = require("path");
const currDir = require('./conf');

if (config.clusteringEnabled && cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);

    // Fork workers
    for (let i = 0; i < config.numWorkers; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died with code: ${code}, and signal: ${signal}`);
        console.log('Starting a new worker');
        cluster.fork();
    });
} else {
    const limiter = rateLimit({
        windowMs: config.rateLimitWindowMs,
        max: config.rateLimitMax,
        message: 'Too many requests from this IP, please try again later.'
    });
    const app = ExpressAppBuilder.createNewApp()
                    .addCors()
                    .use(compression())
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
                    .listen(constants.PORT, () => {
                        if (config.clusteringEnabled) {
                            console.log(`Worker ${process.pid} started`);
                        }
                        loggingUtil.initApp();
                    })
                    .getApp();

    module.exports = app;
}