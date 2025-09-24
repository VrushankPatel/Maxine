require('./src/main/util/logging/log-generic-exceptions')();
const config = require('./src/main/config/config');
const EventEmitter = require('events');
global.eventEmitter = new EventEmitter();
global.broadcast = (event, data) => {
  if (global.eventEmitter) global.eventEmitter.emit(event, data);
  global.lastEvent = { event, data };
};

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
    const jwt = require('jsonwebtoken');
    const bcrypt = require('bcrypt');
    const httpProxy = require('http-proxy');
    const proxy = httpProxy.createProxyServer({});
    const WebSocket = require('ws');
    const mqtt = require('mqtt');

    const stringify = require('fast-json-stringify');
    const winston = require('winston');
    const { logConfiguration } = require('./src/main/config/logging/logging-config');
    winston.configure(logConfiguration);
    const path = require('path');
    const GrpcServer = require('./src/main/grpc/grpc-server');

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
    const errorUnauthorized = Buffer.from('{"error": "Unauthorized"}');
    const errorForbidden = Buffer.from('{"error": "Forbidden"}');

    // Routes map for O(1) lookup
    const routes = new Map();

    // Auth middleware
    const authMiddleware = (req, res, next) => {
        if (!config.authEnabled) {
            return next();
        }
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(errorUnauthorized);
            return;
        }
        const token = authHeader.substring(7);
        try {
            const decoded = jwt.verify(token, config.jwtSecret);
            req.user = decoded;
            next();
        } catch (err) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(errorUnauthorized);
        }
    };

    // Admin role check
    const adminMiddleware = (req, res, next) => {
        if (!config.authEnabled) {
            return next();
        }
        if (req.user && req.user.role === 'admin') {
            next();
        } else {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(errorForbidden);
        }
    };

    // Metrics
    let requestCount = 0;
    let errorCount = 0;

    // Rate limiting disabled in lightning mode for ultimate speed
    // const rateLimitMap = new Map(); // ip -> { count, resetTime }
    // const rateLimitMax = 10000;
    // const rateLimitWindow = 15 * 60 * 1000; // 15 minutes

    // Handler functions - only core features for lightning speed
    // Handle service registration
    const handleRegister = (req, res, query, body) => {
        try {
            const { serviceName, host, port, metadata } = body;
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (!serviceName || !host || !port) {
                // winston.warn(`AUDIT: Invalid registration attempt - missing fields, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(errorMissingServiceName);
                return;
            }
            const nodeId = serviceRegistry.register(serviceName, { host, port, metadata });
            // winston.info(`AUDIT: Service registered - serviceName: ${serviceName}, host: ${host}, port: ${port}, nodeId: ${nodeId}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(stringifyRegister({ nodeId, status: 'registered' }));
        } catch (error) {
            winston.error(`AUDIT: Registration failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    // Handle service heartbeat
    const handleHeartbeat = (req, res, query, body) => {
        try {
            const { nodeId } = body;
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (!nodeId) {
                // winston.warn(`AUDIT: Invalid heartbeat attempt - missing nodeId, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(errorMissingNodeId);
                return;
            }
            const success = serviceRegistry.heartbeat(nodeId);
            // winston.info(`AUDIT: Heartbeat received - nodeId: ${nodeId}, success: ${success}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(stringifySuccess({ success }));
        } catch (error) {
            winston.error(`AUDIT: Heartbeat failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    // Handle service deregistration
    const handleDeregister = (req, res, query, body) => {
        try {
            const { nodeId } = body;
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (!nodeId) {
                // winston.warn(`AUDIT: Invalid deregister attempt - missing nodeId, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(errorMissingNodeId);
                return;
            }
            serviceRegistry.deregister(nodeId);
            // winston.info(`AUDIT: Service deregistered - nodeId: ${nodeId}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            winston.error(`AUDIT: Deregistration failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    // Handle service discovery
    const handleDiscover = (req, res, query, body) => {
        try {
            const serviceName = query.serviceName;
            const clientIP = req.connection.remoteAddress;
            if (!serviceName) {
                // winston.warn(`AUDIT: Invalid discover attempt - missing serviceName, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(errorMissingServiceName);
                return;
            }
            const version = query.version;
            const strategy = query.loadBalancing || 'round-robin';
            const tags = query.tags ? query.tags.split(',') : [];
            const node = serviceRegistry.discover(serviceName, { version, loadBalancing: strategy, tags, ip: clientIP });
            if (!node) {
                winston.info(`AUDIT: Service discovery failed - serviceName: ${serviceName}, version: ${version}, strategy: ${strategy}, tags: ${tags}, clientIP: ${clientIP}`);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(serviceUnavailable);
                return;
            }
            const resolvedVersion = version === 'latest' ? serviceRegistry.getLatestVersion(serviceName) : version;
            const fullServiceName = resolvedVersion ? `${serviceName}:${resolvedVersion}` : serviceName;
            // winston.info(`AUDIT: Service discovered - serviceName: ${fullServiceName}, strategy: ${strategy}, tags: ${tags}, node: ${node.nodeName}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(stringifyDiscover({ address: node.address, nodeName: node.nodeName, healthy: true }));
        } catch (error) {
            winston.error(`AUDIT: Discovery failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    // Handle list all services
    const handleServers = (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const services = serviceRegistry.getServices();
            // winston.info(`AUDIT: Services list requested - count: ${services.length}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(stringifyServers({ services }));
        } catch (error) {
            winston.error(`AUDIT: Services list failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    // Handle health check
    const handleHealth = (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const services = serviceRegistry.servicesCount;
            const nodes = serviceRegistry.nodesCount;
            // winston.info(`AUDIT: Health check requested - services: ${services}, nodes: ${nodes}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(stringifyHealth({ status: 'ok', services, nodes }));
        } catch (error) {
            winston.error(`AUDIT: Health check failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    // Handle metrics
    const handleMetrics = (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const uptime = process.uptime();
            const services = serviceRegistry.servicesCount;
            const nodes = serviceRegistry.nodesCount;
            const persistenceEnabled = config.persistenceEnabled;
            const persistenceType = config.persistenceType;
            // winston.info(`AUDIT: Metrics requested - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(stringifyMetrics({ uptime, requests: requestCount, errors: errorCount, services, nodes, persistenceEnabled, persistenceType }));
        } catch (error) {
            winston.error(`AUDIT: Metrics failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    routes.set('POST /register', handleRegister);
    routes.set('POST /heartbeat', handleHeartbeat);
    routes.set('DELETE /deregister', handleDeregister);
    routes.set('GET /discover', handleDiscover);
    routes.set('GET /servers', handleServers);
    routes.set('GET /health', handleHealth);
    routes.set('GET /metrics', handleMetrics);
    routes.set('GET /versions', (req, res, query, body) => {
        try {
            const serviceName = query.serviceName;
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (!serviceName) {
                // winston.warn(`AUDIT: Invalid versions request - missing serviceName, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName"}');
                return;
            }
            const versions = serviceRegistry.getVersions(serviceName);
            // winston.info(`AUDIT: Versions requested - serviceName: ${serviceName}, versions: ${versions.join(', ')}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ serviceName, versions }));
        } catch (error) {
            winston.error(`AUDIT: Versions failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });
    // Handle signin for authentication
    routes.set('POST /signin', (req, res, query, body) => {
        try {
            const { username, password } = body;
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (!username || !password) {
                // winston.warn(`AUDIT: Signin failed - missing credentials, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing username or password"}');
                return;
            }
            if (username === config.adminUsername && bcrypt.compareSync(password, config.adminPasswordHash)) {
                const token = jwt.sign({ username, role: 'admin' }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
                // winston.info(`AUDIT: Signin successful - username: ${username}, clientIP: ${clientIP}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ token }));
            } else {
                // winston.warn(`AUDIT: Signin failed - invalid credentials, username: ${username}, clientIP: ${clientIP}`);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
            }
        } catch (error) {
            winston.error(`AUDIT: Signin failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Persistence endpoints
    // Handle registry backup
    routes.set('GET /backup', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (config.authEnabled) {
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    winston.warn(`AUDIT: Unauthorized backup attempt - clientIP: ${clientIP}`);
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(errorUnauthorized);
                    return;
                }
                const token = authHeader.substring(7);
                try {
                    jwt.verify(token, config.jwtSecret);
                } catch (err) {
                    winston.warn(`AUDIT: Invalid token for backup - clientIP: ${clientIP}`);
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(errorUnauthorized);
                    return;
                }
            }
            if (!config.persistenceEnabled) {
                winston.warn(`AUDIT: Backup attempted but persistence not enabled - clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Persistence not enabled"}');
                return;
            }
            const data = serviceRegistry.getRegistryData();
            winston.info(`AUDIT: Registry backup performed - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (error) {
            winston.error(`AUDIT: Backup failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Handle registry restore
    routes.set('POST /restore', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (config.authEnabled) {
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    winston.warn(`AUDIT: Unauthorized restore attempt - clientIP: ${clientIP}`);
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(errorUnauthorized);
                    return;
                }
                const token = authHeader.substring(7);
                try {
                    jwt.verify(token, config.jwtSecret);
                } catch (err) {
                    winston.warn(`AUDIT: Invalid token for restore - clientIP: ${clientIP}`);
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(errorUnauthorized);
                    return;
                }
            }
            if (!config.persistenceEnabled) {
                winston.warn(`AUDIT: Restore attempted but persistence not enabled - clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Persistence not enabled"}');
                return;
            }
            serviceRegistry.setRegistryData(body);
            winston.info(`AUDIT: Registry restore performed - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"success": true}');
        } catch (error) {
            winston.error(`AUDIT: Restore failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Basic tracing endpoints
    // Handle trace start
    routes.set('POST /trace/start', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (config.authEnabled) {
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    winston.warn(`AUDIT: Unauthorized trace start attempt - clientIP: ${clientIP}`);
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(errorUnauthorized);
                    return;
                }
                const token = authHeader.substring(7);
                try {
                    jwt.verify(token, config.jwtSecret);
                } catch (err) {
                    winston.warn(`AUDIT: Invalid token for trace start - clientIP: ${clientIP}`);
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(errorUnauthorized);
                    return;
                }
            }
            const { operation, id } = body;
            if (!id || !operation) {
                winston.warn(`AUDIT: Invalid trace start - missing id or operation, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing id or operation"}');
                return;
            }
            serviceRegistry.startTrace(id, operation);
            winston.info(`AUDIT: Trace started - id: ${id}, operation: ${operation}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"success": true}');
        } catch (error) {
            winston.error(`AUDIT: Trace start failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('POST /trace/event', (req, res, query, body) => {
        const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
        if (config.authEnabled) {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                winston.warn(`AUDIT: Unauthorized trace event attempt - clientIP: ${clientIP}`);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
            const token = authHeader.substring(7);
            try {
                jwt.verify(token, config.jwtSecret);
            } catch (err) {
                winston.warn(`AUDIT: Invalid token for trace event - clientIP: ${clientIP}`);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
        }
        const { id, event } = body;
        if (!id || !event) {
            winston.warn(`AUDIT: Invalid trace event - missing id or event, clientIP: ${clientIP}`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end('{"error": "Missing id or event"}');
            return;
        }
        serviceRegistry.addTraceEvent(id, event);
        winston.info(`AUDIT: Trace event added - id: ${id}, event: ${event}, clientIP: ${clientIP}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"success": true}');
    });

    routes.set('POST /trace/end', (req, res, query, body) => {
        const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
        if (config.authEnabled) {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                winston.warn(`AUDIT: Unauthorized trace end attempt - clientIP: ${clientIP}`);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
            const token = authHeader.substring(7);
            try {
                jwt.verify(token, config.jwtSecret);
            } catch (err) {
                winston.warn(`AUDIT: Invalid token for trace end - clientIP: ${clientIP}`);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
        }
        const { id } = body;
        if (!id) {
            winston.warn(`AUDIT: Invalid trace end - missing id, clientIP: ${clientIP}`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end('{"error": "Missing id"}');
            return;
        }
        serviceRegistry.endTrace(id);
        winston.info(`AUDIT: Trace ended - id: ${id}, clientIP: ${clientIP}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"success": true}');
    });

    routes.set('GET /trace/:id', (req, res, query, body) => {
        const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
        if (config.authEnabled) {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                winston.warn(`AUDIT: Unauthorized trace get attempt - clientIP: ${clientIP}`);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
            const token = authHeader.substring(7);
            try {
                jwt.verify(token, config.jwtSecret);
            } catch (err) {
                winston.warn(`AUDIT: Invalid token for trace get - clientIP: ${clientIP}`);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
        }
        const id = req.url.split('/').pop();
        const trace = serviceRegistry.getTrace(id);
        winston.info(`AUDIT: Trace retrieved - id: ${id}, clientIP: ${clientIP}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(trace));
    });

    // Configuration management endpoints
    // Handle config set
    routes.set('POST /config/set', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (config.authEnabled) {
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    winston.warn(`AUDIT: Unauthorized config set attempt - clientIP: ${clientIP}`);
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(errorUnauthorized);
                    return;
                }
                const token = authHeader.substring(7);
                try {
                    jwt.verify(token, config.jwtSecret);
                } catch (err) {
                    winston.warn(`AUDIT: Invalid token for config set - clientIP: ${clientIP}`);
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(errorUnauthorized);
                    return;
                }
            }
            const { serviceName, key, value, metadata } = body;
            if (!serviceName || !key) {
                winston.warn(`AUDIT: Invalid config set - missing serviceName or key, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName or key"}');
                return;
            }
            const configResult = serviceRegistry.setConfig(serviceName, key, value, metadata);
            winston.info(`AUDIT: Config set - serviceName: ${serviceName}, key: ${key}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(configResult));
        } catch (error) {
            winston.error(`AUDIT: Config set failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Handle config get
    routes.set('GET /config/get', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const serviceName = query.serviceName;
            const key = query.key;
            if (!serviceName || !key) {
                winston.warn(`AUDIT: Invalid config get - missing serviceName or key, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName or key"}');
                return;
            }
            const configValue = serviceRegistry.getConfig(serviceName, key);
            if (!configValue) {
                winston.info(`AUDIT: Config get - not found, serviceName: ${serviceName}, key: ${key}, clientIP: ${clientIP}`);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end('{"error": "Config not found"}');
                return;
            }
            winston.info(`AUDIT: Config get - serviceName: ${serviceName}, key: ${key}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(configValue));
        } catch (error) {
            winston.error(`AUDIT: Config get failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Handle config all
    routes.set('GET /config/all', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const serviceName = query.serviceName;
            if (!serviceName) {
                winston.warn(`AUDIT: Invalid config all - missing serviceName, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName"}');
                return;
            }
            const configs = serviceRegistry.getAllConfigs(serviceName);
            winston.info(`AUDIT: Config all - serviceName: ${serviceName}, count: ${Object.keys(configs).length}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(configs));
        } catch (error) {
            winston.error(`AUDIT: Config all failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Handle config delete
    routes.set('DELETE /config/delete', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (config.authEnabled) {
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    winston.warn(`AUDIT: Unauthorized config delete attempt - clientIP: ${clientIP}`);
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(errorUnauthorized);
                    return;
                }
                const token = authHeader.substring(7);
                try {
                    jwt.verify(token, config.jwtSecret);
                } catch (err) {
                    winston.warn(`AUDIT: Invalid token for config delete - clientIP: ${clientIP}`);
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(errorUnauthorized);
                    return;
                }
            }
            const serviceName = query.serviceName;
            const key = query.key;
            if (!serviceName || !key) {
                winston.warn(`AUDIT: Invalid config delete - missing serviceName or key, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName or key"}');
                return;
            }
            const deleted = serviceRegistry.deleteConfig(serviceName, key);
            if (!deleted) {
                winston.info(`AUDIT: Config delete - not found, serviceName: ${serviceName}, key: ${key}, clientIP: ${clientIP}`);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end('{"error": "Config not found"}');
                return;
            }
            winston.info(`AUDIT: Config delete - serviceName: ${serviceName}, key: ${key}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            winston.error(`AUDIT: Config delete failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Service Mesh Integration
    // Handle Envoy service mesh config generation
    const handleEnvoyConfig = (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const services = serviceRegistry.getAllServices();
            const clusters = [];
            for (const [serviceName, nodes] of services) {
                const lbEndpoints = nodes.map(node => ({
                    endpoint: {
                        address: {
                            socket_address: {
                                address: node.host,
                                port_value: node.port
                            }
                        }
                    }
                }));
                clusters.push({
                    name: serviceName,
                    type: 'STATIC',
                    lb_policy: 'ROUND_ROBIN',
                    load_assignment: {
                        cluster_name: serviceName,
                        endpoints: [{
                            lb_endpoints: lbEndpoints
                        }]
                    }
                });
            }
            const envoyConfig = {
                static_resources: {
                    clusters: clusters
                }
            };
            winston.info(`AUDIT: Envoy config requested - services: ${services.size}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(envoyConfig, null, 2));
        } catch (error) {
            winston.error(`AUDIT: Envoy config failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    // Handle Istio service mesh config generation
    const handleIstioConfig = (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const services = serviceRegistry.getAllServices();
            const configs = [];
            for (const [serviceName, nodes] of services) {
                const subsets = [];
                const versionMap = new Map();
                nodes.forEach(node => {
                    const version = node.metadata?.version || 'default';
                    if (!versionMap.has(version)) {
                        versionMap.set(version, []);
                    }
                    versionMap.get(version).push(`${node.host}:${node.port}`);
                });
                for (const [version, addresses] of versionMap) {
                    subsets.push({
                        name: version,
                        labels: { version: version }
                    });
                }
                const virtualService = {
                    apiVersion: 'networking.istio.io/v1alpha3',
                    kind: 'VirtualService',
                    metadata: { name: serviceName },
                    spec: {
                        hosts: [serviceName],
                        http: [{
                            route: [{
                                destination: {
                                    host: serviceName,
                                    subset: 'default'
                                }
                            }]
                        }]
                    }
                };
                const destinationRule = {
                    apiVersion: 'networking.istio.io/v1alpha3',
                    kind: 'DestinationRule',
                    metadata: { name: serviceName },
                    spec: {
                        host: serviceName,
                        subsets: subsets
                    }
                };
                configs.push({ virtualService, destinationRule });
            }
            winston.info(`AUDIT: Istio config requested - services: ${services.size}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(configs, null, 2));
        } catch (error) {
            winston.error(`AUDIT: Istio config failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    routes.set('GET /service-mesh/envoy-config', handleEnvoyConfig);
    routes.set('GET /service-mesh/istio-config', handleIstioConfig);

    // Versioning endpoints
    routes.set('GET /versions', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const serviceName = query.serviceName;
            if (!serviceName) {
                winston.warn(`AUDIT: Invalid versions request - missing serviceName, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName"}');
                return;
            }
            const versions = serviceRegistry.getVersions(serviceName);
            winston.info(`AUDIT: Versions requested - serviceName: ${serviceName}, versions: ${versions.join(',')}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ serviceName, versions }));
        } catch (error) {
            winston.error(`AUDIT: Versions failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('POST /traffic/set', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const { serviceName, distribution } = body;
            if (!serviceName || !distribution) {
                winston.warn(`AUDIT: Invalid traffic set - missing serviceName or distribution, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName or distribution"}');
                return;
            }
            serviceRegistry.setTrafficDistribution(serviceName, distribution);
            winston.info(`AUDIT: Traffic set - serviceName: ${serviceName}, distribution: ${JSON.stringify(distribution)}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            winston.error(`AUDIT: Traffic set failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('POST /version/promote', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const { serviceName, version } = body;
            if (!serviceName || !version) {
                winston.warn(`AUDIT: Invalid version promote - missing serviceName or version, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName or version"}');
                return;
            }
            serviceRegistry.promoteVersion(serviceName, version);
            winston.info(`AUDIT: Version promoted - serviceName: ${serviceName}, version: ${version}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            winston.error(`AUDIT: Version promote failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('POST /version/retire', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const { serviceName, version } = body;
            if (!serviceName || !version) {
                winston.warn(`AUDIT: Invalid version retire - missing serviceName or version, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName or version"}');
                return;
            }
            serviceRegistry.retireVersion(serviceName, version);
            winston.info(`AUDIT: Version retired - serviceName: ${serviceName}, version: ${version}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            winston.error(`AUDIT: Version retire failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('POST /traffic/shift', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const { serviceName, fromVersion, toVersion, percentage } = body;
            if (!serviceName || !fromVersion || !toVersion || percentage == null) {
                winston.warn(`AUDIT: Invalid traffic shift - missing parameters, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName, fromVersion, toVersion, or percentage"}');
                return;
            }
            serviceRegistry.shiftTraffic(serviceName, fromVersion, toVersion, percentage);
            winston.info(`AUDIT: Traffic shifted - serviceName: ${serviceName}, from: ${fromVersion}, to: ${toVersion}, percentage: ${percentage}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            winston.error(`AUDIT: Traffic shift failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Circuit Breaker endpoints
    // Handle circuit breaker state query
    routes.set('GET /circuit-breaker/:nodeId', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const nodeId = req.url.split('/').pop();
            const state = serviceRegistry.getCircuitState(nodeId);
            winston.info(`AUDIT: Circuit breaker state requested - nodeId: ${nodeId}, state: ${JSON.stringify(state)}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state));
        } catch (error) {
            winston.error(`AUDIT: Circuit breaker state failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Event history endpoints
    // Handle event history query
    routes.set('GET /events', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const since = query.since ? parseInt(query.since) : 0;
            const limit = query.limit ? parseInt(query.limit) : 100;
            const filtered = eventHistory.filter(e => e.timestamp > since).slice(-limit);
            winston.info(`AUDIT: Event history requested - since: ${since}, limit: ${limit}, returned: ${filtered.length}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(filtered));
        } catch (error) {
            winston.error(`AUDIT: Event history failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Actuator endpoints for compatibility
    // Handle actuator health check
    routes.set('GET /api/actuator/health', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            winston.info(`AUDIT: Actuator health requested - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"status": "UP"}');
        } catch (error) {
            winston.error(`AUDIT: Actuator health failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });
    // Handle actuator info
    routes.set('GET /api/actuator/info', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            winston.info(`AUDIT: Actuator info requested - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"build": {"description": "Maxine Lightning Mode", "name": "maxine-discovery"}}');
        } catch (error) {
            winston.error(`AUDIT: Actuator info failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });
    // Handle actuator metrics
    routes.set('GET /api/actuator/metrics', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const mem = process.memoryUsage();
            const uptime = process.uptime();
            winston.info(`AUDIT: Actuator metrics requested - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ mem, uptime }));
        } catch (error) {
            winston.error(`AUDIT: Actuator metrics failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Logs endpoint for compatibility
    // Handle logs download
    routes.set('GET /api/logs/download', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            winston.info(`AUDIT: Logs download requested - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{}');
        } catch (error) {
            winston.error(`AUDIT: Logs download failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Config endpoint for compatibility
    // Handle config get for compatibility
    routes.set('GET /api/maxine/control/config', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            winston.info(`AUDIT: Config get requested - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                logAsync: config.logAsync,
                heartBeatTimeout: config.heartBeatTimeout,
                highPerformanceMode: false,
                logJsonPrettify: config.logJsonPrettify,
                serverSelectionStrategy: 'RR',
                logFormat: 'JSON'
            }));
        } catch (error) {
            winston.error(`AUDIT: Config get failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });
    // Handle config update for compatibility
    routes.set('PUT /api/maxine/control/config', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const key = Object.keys(body)[0];
            const value = body[key];
            if (key === 'serverSelectionStrategy') {
                config[key] = constants.SSS[value] || value;
            } else if (key === 'logFormat') {
                config[key] = constants.LOG_FORMATS[value] || value;
            } else {
                config[key] = value;
            }
            winston.info(`AUDIT: Config updated - key: ${key}, value: ${value}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ [key]: "Success" }));
        } catch (error) {
            winston.error(`AUDIT: Config update failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    const server = http.createServer({ keepAlive: false }, (req, res) => {
          if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
              // Let WebSocket handle upgrade
              return;
          }
          const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';

          // Rate limiting disabled in lightning mode for ultimate speed
          // const now = Date.now();
          // let rateData = rateLimitMap.get(clientIP);
          // if (!rateData || now > rateData.resetTime) {
          //     rateData = { count: 0, resetTime: now + rateLimitWindow };
          //     rateLimitMap.set(clientIP, rateData);
          // }
          // if (rateData.count >= rateLimitMax) {
          //     res.writeHead(429, { 'Content-Type': 'application/json' });
          //     res.end('{"error": "Too many requests"}');
          //     return;
          // }
          // rateData.count++;

         requestCount++;

          const parsedUrl = url.parse(req.url, true);
          const pathname = parsedUrl.pathname;
          const query = parsedUrl.query;
         const method = req.method;

        // Handle proxy routes
        if (pathname.startsWith('/proxy/')) {
            const parts = pathname.split('/');
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (parts.length < 3) {
                winston.warn(`AUDIT: Invalid proxy request - bad path, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Invalid proxy path"}');
                return;
            }
            const serviceName = parts[2];
            const path = '/' + parts.slice(3).join('/');
            const node = serviceRegistry.getRandomNode(serviceName);
            if (!node) {
                winston.info(`AUDIT: Proxy failed - service not found: ${serviceName}, clientIP: ${clientIP}`);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(serviceUnavailable);
                return;
            }
            const target = `http://${node.address}`;
              req.url = path + parsedUrl.search;
              winston.info(`AUDIT: Proxy request - serviceName: ${serviceName}, target: ${target}, path: ${path}, clientIP: ${clientIP}`);
              proxy.web(req, res, { target }, (err) => {
                  if (err) {
                      winston.error(`AUDIT: Proxy error - serviceName: ${serviceName}, target: ${target}, error: ${err.message}, clientIP: ${clientIP}`);
                      // Record circuit breaker failure
                      serviceRegistry.recordFailure(node.nodeName);
                      res.writeHead(500, { 'Content-Type': 'application/json' });
                      res.end('{"error": "Proxy error"}');
                  } else {
                      // Record success for circuit breaker
                      serviceRegistry.recordSuccess(node.nodeName);
                  }
              });
            return;
        }

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
                          handler(req, res, parsedUrl.query, parsedBody);
                      } catch (e) {
                          res.writeHead(400, { 'Content-Type': 'application/json' });
                          res.end(errorInvalidJSON);
                      }
                  });
            } else {
                handler(req, res, parsedUrl.query, {});
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(errorNotFound);
        }
    });

    if (!config.isTestMode || process.env.WEBSOCKET_ENABLED === 'true') {
        if (!config.isTestMode) {
            server.listen(constants.PORT, () => {
                console.log('Maxine lightning-fast server listening on port', constants.PORT);
                console.log('Lightning mode: minimal features for maximum performance using raw HTTP');
            });
        }

        // WebSocket server for real-time event streaming
        const wss = new WebSocket.Server({ server });
        if (config.isTestMode && !process.env.WEBSOCKET_ENABLED) {
            // Skip WebSocket setup in test mode unless explicitly enabled
            return;
        }

        // MQTT client for event publishing
        let mqttClient = null;
        if (config.mqttEnabled) {
            mqttClient = mqtt.connect(config.mqttBroker);
            mqttClient.on('connect', () => {
                console.log('Connected to MQTT broker');
            });
            mqttClient.on('error', (err) => {
                console.error('MQTT connection error:', err);
            });
        }

        // Event persistence
        const eventHistory = [];
        const maxHistory = 1000;
        const eventHistoryFile = path.join(process.cwd(), 'event-history.json');

        const saveEventHistory = () => {
            if (config.persistenceEnabled && config.persistenceType === 'file') {
                try {
                    fs.writeFileSync(eventHistoryFile, JSON.stringify(eventHistory, null, 2));
                } catch (err) {
                    console.error('Failed to save event history:', err);
                }
            }
        };

        const loadEventHistory = () => {
            if (config.persistenceEnabled && config.persistenceType === 'file' && fs.existsSync(eventHistoryFile)) {
                try {
                    const data = fs.readFileSync(eventHistoryFile, 'utf8');
                    const loaded = JSON.parse(data);
                    eventHistory.push(...loaded.slice(-maxHistory));
                } catch (err) {
                    console.error('Failed to load event history:', err);
                }
            }
        };

        // Load event history on startup
        loadEventHistory();

        const broadcast = (event, data) => {
            const messageObj = { event, data, timestamp: Date.now() };
            const message = JSON.stringify(messageObj);
            // Store in history
            eventHistory.push(messageObj);
            if (eventHistory.length > maxHistory) {
                eventHistory.shift();
            }
            // Save to file periodically or on important events
            if (eventHistory.length % 100 === 0) {
                saveEventHistory();
            }
            // Emit to eventEmitter for SSE
            global.eventEmitter.emit(event, data);
            // Store last event for testing
            global.lastEvent = { event, data };
            // WebSocket broadcast with filtering
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    const filter = clientFilters.get(client);
                    if (matchesFilter(event, data, filter)) {
                        client.send(message);
                    }
                }
            });
            // MQTT publish
            if (mqttClient && mqttClient.connected) {
                const topic = `${config.mqttTopic}/${event}`;
                mqttClient.publish(topic, message, { qos: 1 }, (err) => {
                    if (err) console.error('MQTT publish error:', err);
                });
            }
        };

        // Make broadcast available globally for service registry
        global.broadcast = broadcast;

        const matchesFilter = (event, data, filter) => {
            if (!filter) return true;
            if (filter.event && filter.event !== event) return false;
            if (filter.serviceName && data.serviceName && filter.serviceName !== data.serviceName) return false;
            if (filter.nodeId && data.nodeId && filter.nodeId !== data.nodeId) return false;
            // Add more criteria as needed
            return true;
        };

        const clientFilters = new Map(); // ws -> filter object
        const clientAuth = new Map(); // ws -> authenticated boolean

        wss.on('connection', (ws) => {
            console.log('WebSocket client connected for event streaming');
            clientFilters.set(ws, null); // no filter by default
            clientAuth.set(ws, !config.authEnabled); // authenticated if auth not enabled

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    if (data.auth) {
                        if (config.authEnabled) {
                            try {
                                const decoded = jwt.verify(data.auth, config.jwtSecret);
                                clientAuth.set(ws, true);
                                ws.send(JSON.stringify({ type: 'authenticated' }));
                            } catch (err) {
                                ws.send(JSON.stringify({ type: 'auth_failed' }));
                                ws.close();
                            }
                        }
                    } else if (!clientAuth.get(ws)) {
                        ws.send(JSON.stringify({ type: 'auth_required' }));
                        ws.close();
                        return;
                    }
                    if (data.subscribe) {
                        clientFilters.set(ws, data.subscribe);
                        ws.send(JSON.stringify({ type: 'subscribed', filter: data.subscribe }));
                    } else if (data.unsubscribe) {
                        clientFilters.set(ws, null);
                        ws.send(JSON.stringify({ type: 'unsubscribed' }));
                    }
                } catch (e) {
                    // ignore invalid messages
                }
            });

            ws.on('close', () => {
                console.log('WebSocket client disconnected');
                clientFilters.delete(ws);
                clientAuth.delete(ws);
            });
        });

        // Make broadcast available to handlers
        global.broadcast = broadcast;
    }

    // Start gRPC server
    const grpcServer = new GrpcServer(serviceRegistry, config);
    grpcServer.start(50051); // Default gRPC port

    console.log('Server setup complete');
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