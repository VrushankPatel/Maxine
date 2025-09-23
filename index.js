require('./src/main/util/logging/log-generic-exceptions')();
const config = require('./src/main/config/config');

// Initialize OpenTelemetry tracing if enabled
if (config.tracingEnabled) {
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');

    const sdk = new NodeSDK({
        serviceName: 'maxine-service-registry',
        traceExporter: new JaegerExporter({
            endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
        }),
        instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();
    console.log('OpenTelemetry tracing enabled');
}

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
const { discoveryService } = require('./src/main/service/discovery-service');
const { statusMonitorConfig, actuatorConfig } = require('./src/main/config/actuator/actuator-config');
const { loadSwaggerYAML } = require('./src/main/util/util');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const swaggerDocument = loadSwaggerYAML();
const { healthService } = require('./src/main/service/health-service');
const path = require("path");
const currDir = require('./conf');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const spdy = require('spdy');

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
                      .ifProperty("highPerformanceMode", false)
                          .addCompression()
                      .endIfProperty()
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
                      .listenOrSpdy(constants.PORT, () => {
                          if (config.clusteringEnabled) {
                              console.log(`Worker ${process.pid} started`);
                          }
                          loggingUtil.initApp();
                      })
                     .getApp();

    if (config.grpcEnabled) {
        const packageDefinition = protoLoader.loadSync(path.join(__dirname, 'api-specs/maxine.proto'), {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
        const maxineProto = grpc.loadPackageDefinition(packageDefinition).maxine;
        const grpcServer = new grpc.Server();
        grpcServer.addService(maxineProto.DiscoveryService.service, {
            Discover: (call, callback) => {
                const { serviceName, version, namespace = 'default', region = 'default', zone = 'default', ip, proxy = true } = call.request;
                let fullServiceName = (region !== "default" || zone !== "default") ?
                    (version ? `${namespace}:${region}:${zone}:${serviceName}:${version}` : `${namespace}:${region}:${zone}:${serviceName}`) :
                    (version ? `${namespace}:${serviceName}:${version}` : `${namespace}:${serviceName}`);
                const serviceNode = discoveryService.getNode(fullServiceName, ip);
                if (!serviceNode) {
                    callback(null, { message: 'Service unavailable' });
                    return;
                }
                const addressToRedirect = serviceNode.address;
                callback(null, { address: addressToRedirect, nodeName: serviceNode.nodeName });
            }
        });
        grpcServer.bindAsync(`0.0.0.0:${config.grpcPort}`, grpc.ServerCredentials.createInsecure(), () => {
            grpcServer.start();
            console.log(`gRPC server running on port ${config.grpcPort}`);
        });
    }

    module.exports = app;
}