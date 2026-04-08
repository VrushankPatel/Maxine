require('./src/main/util/logging/log-generic-exceptions')();
const loggingUtil = require('./src/main/util/logging/logging-util');
const { constants } = require('./src/main/util/constants/constants');
const actuator = require('express-actuator');
const ExpressAppBuilder = require('./src/main/builders/app-builder');
const maxineApiRoutes = require('./src/main/routes/api-routes');
const expressStatusMonitor = require('express-status-monitor');
const logWebExceptions = require('./src/main/util/logging/log-web-exceptions');
const logRequest = require('./src/main/util/logging/log-request');
const traceContext = require('./src/main/util/logging/trace-context');
const { authenticationController } = require('./src/main/controller/security/authentication-controller');
const { registryService } = require('./src/main/service/registry-service');
const { runtimeOrchestratorService } = require('./src/main/service/runtime-orchestrator-service');
const swaggerUi = require('swagger-ui-express');
const { statusMonitorConfig, actuatorConfig } = require('./src/main/config/actuator/actuator-config');
const { loadSwaggerYAML } = require('./src/main/util/util');
const swaggerDocument = loadSwaggerYAML();
const path = require("path");
const currDir = require('./conf');

const buildApp = () => ExpressAppBuilder.createNewApp()
    .addCors()
    .ifPropertyOnce("statusMonitorEnabled")
        .use(expressStatusMonitor(statusMonitorConfig))
    .use(traceContext)
    .use(logRequest)
    .use(authenticationController)
    .mapStaticDir(path.join(currDir, "client"))
    .mapStaticDirWithRoute('/logs', path.join(currDir, "logs"))
    .ifPropertyOnce("actuatorEnabled")
        .use(actuator(actuatorConfig))
    .use('/api', maxineApiRoutes)
    .ifPropertyOnce('profile', 'dev')
        .use('/api-spec', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
        .use('/shutdown', (_req, res) => {
            res.status(202).json({ message: 'Shutdown requested. Stopping Maxine.' });
            process.exit(0);
        })
    .blockUnknownUrls()
    .use(logWebExceptions)
    .getApp();

const app = buildApp();

const startServer = async () => {
    await registryService.initialize();
    await runtimeOrchestratorService.start();

    return new Promise((resolve) => {
        const server = app.listen(constants.PORT, () => {
            loggingUtil.initApp();
            resolve(server);
        });
    });
};

if (require.main === module) {
    startServer().catch((err) => {
        loggingUtil.errorAndClose(`Unable to start Maxine: ${err.message}`);
    });
}

module.exports = app;
module.exports.buildApp = buildApp;
module.exports.startServer = startServer;
