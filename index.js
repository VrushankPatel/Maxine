require('./src/main/util/logging/log-generic-exceptions')();
const config = require('./src/main/config/config');

process.on('uncaughtException', (err) => {
  console.error('uncaught exception', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('unhandled rejection', reason);
  process.exit(1);
});

// Lightning mode: minimal, fast server
const { constants } = require('./src/main/util/constants/constants');
const ExpressAppBuilder = require('./src/main/builders/app-builder');

let builder;

if (config.lightningMode) {
    // Minimal lightning mode with raw HTTP for ultimate speed
    const { LightningServiceRegistrySimple } = require('./src/main/entity/lightning-service-registry-simple');
    const serviceRegistry = new LightningServiceRegistrySimple();

    // Raw HTTP server for maximum performance
    const http = require('http');
    const url = require('url');

    const stringify = require('fast-json-stringify');

    // Precompiled stringify functions for performance
    const registerResponseSchema = {
        type: 'object',
        properties: {
            nodeId: { type: 'string' },
            status: { type: 'string' }
        }
    };
    const stringifyRegister = stringify(registerResponseSchema);

    const discoverResponseSchema = {
        type: 'object',
        properties: {
            address: { type: 'string' },
            nodeName: { type: 'string' },
            healthy: { type: 'boolean' }
        }
    };
    const stringifyDiscover = stringify(discoverResponseSchema);

    const successResponseSchema = {
        type: 'object',
        properties: {
            success: { type: 'boolean' }
        }
    };
    const stringifySuccess = stringify(successResponseSchema);

    const serversResponseSchema = {
        type: 'object',
        properties: {
            services: { type: 'array', items: { type: 'string' } }
        }
    };
    const stringifyServers = stringify(serversResponseSchema);

    const healthResponseSchema = {
        type: 'object',
        properties: {
            status: { type: 'string' },
            services: { type: 'number' },
            nodes: { type: 'number' }
        }
    };
    const stringifyHealth = stringify(healthResponseSchema);

    const metricsResponseSchema = {
        type: 'object',
        properties: {
            uptime: { type: 'number' },
            requests: { type: 'number' },
            errors: { type: 'number' },
            services: { type: 'number' },
            nodes: { type: 'number' },
            persistenceEnabled: { type: 'boolean' },
            persistenceType: { type: 'string' }
        }
    };
    const stringifyMetrics = stringify(metricsResponseSchema);

    // Pre-allocated error buffers
    const errorMissingServiceName = Buffer.from('{"error": "Missing serviceName"}');
    const errorMissingNodeId = Buffer.from('{"error": "Missing nodeId"}');
    const errorInvalidJSON = Buffer.from('{"error": "Invalid JSON"}');
    const errorNotFound = Buffer.from('{"message": "Not found"}');
    const successTrue = Buffer.from('{"success":true}');
    const serviceUnavailable = Buffer.from('{"message": "Service unavailable"}');

    // Routes map for O(1) lookup
    const routes = new Map();

    // Metrics
    let requestCount = 0;
    let errorCount = 0;

    // Rate limiting
    const rateLimitMap = new Map(); // ip -> { count, resetTime }
    const rateLimitMax = 10000;
    const rateLimitWindow = 15 * 60 * 1000; // 15 minutes

    // Handler functions - only core features for lightning speed
    const handleRegister = (req, res, query, body) => {
        const { serviceName, host, port } = body;
        if (!serviceName || !host || !port) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(errorMissingServiceName);
            return;
        }
        const nodeId = serviceRegistry.register(serviceName, { host, port });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(stringifyRegister({ nodeId, status: 'registered' }));
    };

    const handleHeartbeat = (req, res, query, body) => {
        const { nodeId } = body;
        if (!nodeId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(errorMissingNodeId);
            return;
        }
        const success = serviceRegistry.heartbeat(nodeId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(stringifySuccess({ success }));
    };

    const handleDeregister = (req, res, query, body) => {
        const { nodeId } = body;
        if (!nodeId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(errorMissingNodeId);
            return;
        }
        serviceRegistry.deregister(nodeId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(successTrue);
    };

    const handleDiscover = (req, res, query, body) => {
        const serviceName = query.serviceName;
        if (!serviceName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(errorMissingServiceName);
            return;
        }
        const strategy = query.loadBalancing || 'round-robin';
        const clientIP = req.connection.remoteAddress;
        const node = serviceRegistry.getRandomNode(serviceName, strategy, clientIP);
        if (!node) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(serviceUnavailable);
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(stringifyDiscover({ address: node.address, nodeName: node.nodeName, healthy: true }));
    };

    const handleServers = (req, res, query, body) => {
        const services = serviceRegistry.getServices();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(stringifyServers({ services }));
    };

    const handleHealth = (req, res, query, body) => {
        const services = serviceRegistry.servicesCount;
        const nodes = serviceRegistry.nodesCount;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(stringifyHealth({ status: 'ok', services, nodes }));
    };

    const handleMetrics = (req, res, query, body) => {
        const uptime = process.uptime();
        const services = serviceRegistry.servicesCount;
        const nodes = serviceRegistry.nodesCount;
        const persistenceEnabled = config.persistenceEnabled;
        const persistenceType = config.persistenceType;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(stringifyMetrics({ uptime, requests: requestCount, errors: errorCount, services, nodes, persistenceEnabled, persistenceType }));
    };

    routes.set('POST /register', handleRegister);
    routes.set('POST /heartbeat', handleHeartbeat);
    routes.set('DELETE /deregister', handleDeregister);
    routes.set('GET /discover', handleDiscover);
    routes.set('GET /servers', handleServers);
    routes.set('GET /health', handleHealth);
    routes.set('GET /metrics', handleMetrics);

    // Persistence endpoints
    routes.set('GET /backup', (req, res, query, body) => {
        if (!config.persistenceEnabled) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end('{"error": "Persistence not enabled"}');
            return;
        }
        try {
            const data = serviceRegistry.getRegistryData();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Backup failed"}');
        }
    });

    routes.set('POST /restore', (req, res, query, body) => {
        if (!config.persistenceEnabled) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end('{"error": "Persistence not enabled"}');
            return;
        }
        try {
            serviceRegistry.setRegistryData(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"success": true}');
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Restore failed"}');
        }
    });

    // Actuator endpoints for compatibility
    routes.set('GET /api/actuator/health', (req, res, query, body) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"status": "UP"}');
    });
    routes.set('GET /api/actuator/info', (req, res, query, body) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"build": {"description": "Maxine Lightning Mode", "name": "maxine-discovery"}}');
    });
    routes.set('GET /api/actuator/metrics', (req, res, query, body) => {
        const mem = process.memoryUsage();
        const uptime = process.uptime();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ mem, uptime }));
    });

    // Logs endpoint for compatibility
    routes.set('GET /api/logs/download', (req, res, query, body) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
    });

    // Config endpoint for compatibility
    routes.set('GET /api/maxine/control/config', (req, res, query, body) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            logAsync: config.logAsync,
            heartBeatTimeout: config.heartBeatTimeout,
            highPerformanceMode: false,
            logJsonPrettify: config.logJsonPrettify,
            serverSelectionStrategy: 'RR',
            logFormat: 'JSON'
        }));
    });
    routes.set('PUT /api/maxine/control/config', (req, res, query, body) => {
        const key = Object.keys(body)[0];
        const value = body[key];
        if (key === 'serverSelectionStrategy') {
            config[key] = constants.SSS[value] || value;
        } else if (key === 'logFormat') {
            config[key] = constants.LOG_FORMATS[value] || value;
        } else {
            config[key] = value;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ [key]: "Success" }));
    });

     const server = http.createServer({ keepAlive: true, keepAliveInitialDelay: 0 }, (req, res) => {
         const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';

         // Rate limiting
         const now = Date.now();
         let rateData = rateLimitMap.get(clientIP);
         if (!rateData || now > rateData.resetTime) {
             rateData = { count: 0, resetTime: now + rateLimitWindow };
             rateLimitMap.set(clientIP, rateData);
         }
         if (rateData.count >= rateLimitMax) {
             res.writeHead(429, { 'Content-Type': 'application/json' });
             res.end('{"error": "Too many requests"}');
             return;
         }
         rateData.count++;

         requestCount++;

         const parsedUrl = new URL(req.url, `http://localhost`);
         const pathname = parsedUrl.pathname;
         const query = Object.fromEntries(parsedUrl.searchParams);
         const method = req.method;

        // Use routes map for O(1) lookup
        const routeKey = `${method} ${pathname}`;
        const handler = routes.get(routeKey);
        if (handler) {
            if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
                 const chunks = [];
                 req.on('data', chunk => chunks.push(chunk));
                 req.on('end', () => {
                     const body = Buffer.concat(chunks).toString();
                     try {
                         const parsedBody = body ? JSON.parse(body) : {};
                         handler(req, res, query, parsedBody);
                     } catch (e) {
                         res.writeHead(400, { 'Content-Type': 'application/json' });
                         res.end(errorInvalidJSON);
                     }
                 });
            } else {
                handler(req, res, query, {});
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(errorNotFound);
        }
    });

    if (!config.isTestMode) {
        server.listen(constants.PORT, () => {
            console.log('Maxine lightning-fast server listening on port', constants.PORT);
            console.log('Lightning mode: minimal features for maximum performance using raw HTTP');
        });


    }

    builder = { getApp: () => server };
} else {
    // Full mode
    const loggingUtil = require('./src/main/util/logging/logging-util');
    const maxineApiRoutes = require('./src/main/routes/api-routes');
    const { discoveryService } = require('./src/main/service/discovery-service');
    const { healthService } = require('./src/main/service/health-service');
    const { serviceRegistry } = require('./src/main/entity/service-registry');
    const path = require("path");
    const currDir = require('./conf');

    builder = ExpressAppBuilder.createNewApp()
        .use('/api', (req, res, next) => {
            req.url = req.url.replace(/^\/api/, '') || '/';
            maxineApiRoutes(req, res, next);
        })
        .blockUnknownUrls()
        .invoke(() => console.log('before listen'));

    if (!config.isTestMode) {
        builder.listenOrSpdy(constants.PORT, () => {
            console.log('Maxine lightning-fast server listening on port', constants.PORT);
            console.log('Full mode: comprehensive features with optimized performance');
        });
    }
}

module.exports = builder.getApp();