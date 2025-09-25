// Enable ultra-fast mode for maximum performance if not already set
if (!process.env.ULTRA_FAST_MODE) process.env.ULTRA_FAST_MODE = 'true';
if (!process.env.LIGHTNING_MODE) process.env.LIGHTNING_MODE = 'false';
// console.log('Starting Maxine server...'); // Removed for performance
require('./src/main/util/logging/log-generic-exceptions')();

const config = require('./src/main/config/config');
// console.log('Config loaded:', { ultraFastMode: config.ultraFastMode, lightningMode: config.lightningMode }); // Removed for performance
const { trace, metrics } = require('@opentelemetry/api');
const http = require('http');
const http2 = require('http2');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Initialize OpenTelemetry tracing and metrics only if not ultra-fast mode and not lightning mode
let sdk;
if (!config.ultraFastMode && !config.lightningMode) {
  // Tracing and metrics disabled in ultra-fast and lightning modes for performance
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');

  const jaegerExporter = new JaegerExporter({
    endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
  });

   sdk = new NodeSDK({
    serviceName: 'maxine-service-registry',
    traceExporter: jaegerExporter,
  });

  try {
    sdk.start();
  } catch (e) {
    // Ignore if start is deprecated
  }

  try {
    // Initialize Prometheus metrics using prom-client
    const promClient = require('prom-client');
    const register = new promClient.Registry();

    // Add default metrics
    promClient.collectDefaultMetrics({ register });

    // Custom metrics for Maxine
    const serviceRegistrations = new promClient.Counter({
      name: 'maxine_service_registrations_total',
      help: 'Total number of service registrations',
      registers: [register]
    });

    const serviceDiscoveries = new promClient.Counter({
      name: 'maxine_service_discoveries_total',
      help: 'Total number of service discoveries',
      labelNames: ['service_name', 'strategy'],
      registers: [register]
    });

    const serviceHeartbeats = new promClient.Counter({
      name: 'maxine_service_heartbeats_total',
      help: 'Total number of service heartbeats',
      registers: [register]
    });

    const serviceDeregistrations = new promClient.Counter({
      name: 'maxine_service_deregistrations_total',
      help: 'Total number of service deregistrations',
      registers: [register]
    });

    const cacheHits = new promClient.Counter({
      name: 'maxine_cache_hits_total',
      help: 'Total number of cache hits',
      registers: [register]
    });

    const cacheMisses = new promClient.Counter({
      name: 'maxine_cache_misses_total',
      help: 'Total number of cache misses',
      registers: [register]
    });

    const activeServices = new promClient.Gauge({
      name: 'maxine_services_active',
      help: 'Number of active services',
      registers: [register]
    });

    const activeNodes = new promClient.Gauge({
      name: 'maxine_nodes_active',
      help: 'Number of active nodes',
      registers: [register]
    });

    const circuitBreakersOpen = new promClient.Gauge({
      name: 'maxine_circuit_breakers_open',
      help: 'Number of open circuit breakers',
      registers: [register]
    });

    const responseTimeHistogram = new promClient.Histogram({
      name: 'maxine_response_time_seconds',
      help: 'Response time histogram for service operations',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10],
      registers: [register]
    });

    // Expose metrics endpoint
    const express = require('express');
    const metricsApp = express();
    metricsApp.get('/metrics', async (req, res) => {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    });
    metricsApp.listen(9464, () => {
      console.log('Prometheus metrics server listening on port 9464');
    });

    // Store metrics globally for use in registry
    global.promMetrics = {
      serviceRegistrations,
      serviceDiscoveries,
      serviceHeartbeats,
      serviceDeregistrations,
      cacheHits,
      cacheMisses,
      activeServices,
      activeNodes,
      circuitBreakersOpen,
      responseTimeHistogram
    };

    console.log('OpenTelemetry tracing and Prometheus metrics initialized');
  } catch (error) {
    console.error('Error initializing OpenTelemetry:', error);
  }
}

const EventEmitter = require('events');
global.eventEmitter = new EventEmitter();

// Global meter for OpenTelemetry metrics
global.meter = metrics.getMeter('maxine-service-registry');
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

if (config.ultraFastMode) {
    // Ultra-Fast Mode: Extreme performance optimizations
    // Disable all non-essential features (logging, metrics, etc.)
    // Use shared memory for inter-process communication
    // Implement zero-copy operations where possible
    // Pre-allocate all buffers and objects
    // Use UDP for heartbeats instead of TCP
    // Memory-mapped persistence for speed

    const { LightningServiceRegistrySimple } = require('./src/main/entity/lightning-service-registry-simple');
    const serviceRegistry = new LightningServiceRegistrySimple();
    global.serviceRegistry = serviceRegistry;

    // Raw HTTP server for maximum performance, but stripped down
    const http = require('http');
    const url = require('url');
    const dgram = require('dgram');
    const jwt = require('jsonwebtoken');
    const bcrypt = require('bcrypt');
    const httpProxy = require('http-proxy');
    const proxy = httpProxy.createProxyServer({});
    const WebSocket = require('ws');
    const mqtt = require('mqtt');

    const stringify = require('fast-json-stringify');
    const winston = require('winston');
    const { logConfiguration } = require('./src/main/config/logging/logging-config');
    // Disable logging in ultra-fast mode
    // winston.configure(logConfiguration);
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

    // Disable metrics in ultra-fast mode
    // const metricsResponseSchema = { ... };
    // const stringifyMetrics = stringify(metricsResponseSchema);

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

    // Disable auth in ultra-fast mode for speed
    // const authMiddleware = ...

    // Disable rate limiting

    // Handler functions - only core features for ultra speed
    // Handle service registration
    const handleRegister = (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (!serviceRegistry.checkRateLimit(clientIP)) {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end('{"error": "Rate limit exceeded"}');
                return;
            }

            const { serviceName, host, port, metadata } = body;

            if (!serviceName || !host || !port) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(errorMissingServiceName);
                return;
            }
            const nodeId = serviceRegistry.register(serviceName, { host, port, metadata });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(stringifyRegister({ nodeId, status: 'registered' }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    // Handle service heartbeat - use UDP if enabled
    const handleHeartbeat = (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (!serviceRegistry.checkRateLimit(clientIP)) {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end('{"error": "Rate limit exceeded"}');
                return;
            }

            const { nodeId } = body;
            if (!nodeId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(errorMissingNodeId);
                return;
            }
            const success = serviceRegistry.heartbeat(nodeId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(stringifySuccess({ success }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    // Handle service deregistration
    const handleDeregister = (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (!serviceRegistry.checkRateLimit(clientIP)) {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end('{"error": "Rate limit exceeded"}');
                return;
            }

            const { nodeId } = body;
            if (!nodeId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(errorMissingNodeId);
                return;
            }
            serviceRegistry.deregister(nodeId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };
    // Handle service discovery - ultra-fast mode uses optimized method
    const handleDiscover = async (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (!serviceRegistry.checkRateLimit(clientIP)) {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end('{"error": "Rate limit exceeded"}');
                return;
            }

            const serviceName = query.serviceName;
            if (!serviceName) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(errorMissingServiceName);
                return;
            }
            const version = query.version;
            const strategy = query.loadBalancing || 'round-robin';
            const tags = query.tags ? query.tags.split(',') : [];

            // Use ultra-fast method for maximum performance
            let fullServiceName = serviceName;
            if (version) {
                if (version === 'latest') {
                    const latest = serviceRegistry.getLatestVersion(serviceName);
                    if (latest) {
                        fullServiceName = `${serviceName}:${latest}`;
                    }
                } else {
                    fullServiceName = `${serviceName}:${version}`;
                }
            }

            // Check for traffic distribution (canary)
            const distribution = serviceRegistry.getTrafficDistribution ? serviceRegistry.getTrafficDistribution(serviceName) : {};
            if (Object.keys(distribution).length > 0) {
                const rand = Math.random() * 100;
                let cumulative = 0;
                for (const [ver, percent] of Object.entries(distribution)) {
                    cumulative += percent;
                    if (rand <= cumulative) {
                        fullServiceName = `${serviceName}:${ver}`;
                        break;
                    }
                }
            }

            const node = serviceRegistry.ultraFastGetRandomNodeSync(fullServiceName, strategy, clientIP, tags);
            if (!node) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(serviceUnavailable);
                return;
            }
            // Ultra-fast JSON response using pre-allocated buffer
            const addr = node.address;
            const nodeName = node.nodeName;
            const addrLen = addr.length;
            const nodeLen = nodeName.length;
            const totalLen = 40 + addrLen + nodeLen;
            const buf = Buffer.allocUnsafe(totalLen);
            let offset = 0;
            buf.write('{"address":"', offset); offset += 11;
            buf.write(addr, offset); offset += addrLen;
            buf.write('","nodeName":"', offset); offset += 13;
            buf.write(nodeName, offset); offset += nodeLen;
            buf.write('","healthy":true}', offset);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(buf);
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    // Handle list all services
    const handleServers = (req, res, query, body) => {
        try {
            const services = serviceRegistry.getServices();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(stringifyServers({ services }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    // Handle health check
    const handleHealth = (req, res, query, body) => {
        try {
            const services = serviceRegistry.servicesCount;
            const nodes = serviceRegistry.nodesCount;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(stringifyHealth({ status: 'ok', services, nodes }));
        } catch (error) {
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

    // Disable other endpoints in ultra-fast mode

    // Correlation ID generation
    const generateCorrelationId = () => {
        return `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    };

    // Create server with HTTP/2 support if enabled
    let server;
    const requestHandler = (req, res) => {
        if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
            return;
        }
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = parsedUrl.pathname;
        const method = req.method;

        // Handle correlation ID
        let correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || generateCorrelationId();
        res.setHeader('x-correlation-id', correlationId);

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
                          // Add correlation ID to request object for handlers
                          req.correlationId = correlationId;
                          handler(req, res, Object.fromEntries(parsedUrl.searchParams), parsedBody);
                      } catch (e) {
                          res.writeHead(400, { 'Content-Type': 'application/json' });
                          res.end(errorInvalidJSON);
                      }
                  });
            } else {
                req.correlationId = correlationId;
                handler(req, res, Object.fromEntries(parsedUrl.searchParams), {});
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(errorNotFound);
        }
    };

    if (config.http2Enabled) {
        // Load SSL certificates for HTTP/2
        const certsDir = path.join(__dirname, 'src/main/config/certs');
        const keyPath = path.join(certsDir, 'server.key');
        const certPath = path.join(certsDir, 'server.crt');

        if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
            const options = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath),
                allowHTTP1: true // Allow HTTP/1.1 fallback
            };
            server = http2.createSecureServer(options, requestHandler);
            console.log('Maxine server started with HTTP/2 support on port', constants.PORT);
        } else {
            console.log('HTTP/2 certificates not found, falling back to HTTP/1.1');
            server = http.createServer({ keepAlive: false }, requestHandler);
        }
    } else {
        server = http.createServer({ keepAlive: false }, requestHandler);
    }

    if (!config.isTestMode) {
        server.listen(constants.PORT, () => {
            const protocol = config.http2Enabled ? 'HTTP/2' : 'HTTP/1.1';
            console.log(`Maxine server started in ultra-fast mode with ${protocol} on port ${constants.PORT}`);
        }).on('error', (err) => {
            console.error('Server listen error:', err);
        });
        // Keep the process alive
        setInterval(() => {}, 1000);
    }

    // UDP server for ultra-fast heartbeats
    if (config.udpEnabled) {
        const udpServer = dgram.createSocket('udp4');
        udpServer.on('message', (msg, rinfo) => {
            try {
                const data = JSON.parse(msg.toString());
                if (data.nodeId) {
                    serviceRegistry.heartbeat(data.nodeId);
                }
            } catch (e) {
                // ignore invalid messages
            }
        });
        udpServer.bind(config.udpPort, () => {
            // UDP server bound
        });
    }

    // Disable WebSocket, MQTT, gRPC in ultra-fast mode

    // Ultra-Fast server setup complete
    builder = { getApp: () => server };
    module.exports = builder.getApp();
} else if (config.lightningMode && !config.ultraFastMode) {
    // Minimal lightning mode with raw HTTP for ultimate speed
    const { LightningServiceRegistrySimple } = require('./src/main/entity/lightning-service-registry-simple');
    const serviceRegistry = new LightningServiceRegistrySimple();
    global.serviceRegistry = serviceRegistry;

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
    const fs = require('fs');
    const https = require('https');
    const GrpcServer = require('./src/main/grpc/grpc-server');
    const passport = require('passport');
    const GoogleStrategy = require('passport-google-oauth20').Strategy;
    const SamlStrategy = require('passport-saml').Strategy;

    // OAuth2 setup
    if (config.oauth2Enabled && config.googleClientId && config.googleClientSecret) {
        passport.use(new GoogleStrategy({
            clientID: config.googleClientId,
            clientSecret: config.googleClientSecret,
            callbackURL: '/auth/google/callback'
        }, (accessToken, refreshToken, profile, done) => {
            // Here, you can save user to database or just return profile
            return done(null, profile);
        }));

        passport.serializeUser((user, done) => {
            done(null, user.id);
        });

        passport.deserializeUser((id, done) => {
            // Find user by id
            done(null, { id });
        });
    }

    // SAML setup
    if (config.samlEnabled && config.samlEntryPoint && config.samlIssuer && config.samlCert) {
        passport.use(new SamlStrategy({
            entryPoint: config.samlEntryPoint,
            issuer: config.samlIssuer,
            cert: config.samlCert,
            callbackUrl: config.samlCallbackUrl
        }, (profile, done) => {
            // Here, you can save user to database or just return profile
            return done(null, profile);
        }));

        passport.serializeUser((user, done) => {
            done(null, user.nameID || user.id);
        });

        passport.deserializeUser((id, done) => {
            // Find user by id
            done(null, { id });
        });
    }

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
            persistenceType: { type: 'string' },
            wsConnections: { type: 'number' },
            eventsBroadcasted: { type: 'number' },
            cacheHits: { type: 'number' },
            cacheMisses: { type: 'number' },
            redisCacheHits: { type: 'number' },
            redisCacheMisses: { type: 'number' }
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

    // Object pooling for response objects to reduce GC pressure
    const responsePool = {
        register: [],
        discover: [],
        success: [],
        health: [],
        metrics: [],
        maxPoolSize: 1000,

        get(type) {
            if (this[type].length > 0) {
                return this[type].pop();
            }
            return null;
        },

        put(type, obj) {
            if (this[type].length < this.maxPoolSize) {
                this[type].push(obj);
            }
        }
    };

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
    let wsConnectionCount = 0;
    let eventBroadcastCount = 0;

    // Rate limiting disabled in lightning mode for ultimate speed
    // const rateLimitMap = new Map(); // ip -> { count, resetTime }
    // const rateLimitMax = 10000;
    // const rateLimitWindow = 15 * 60 * 1000; // 15 minutes

    // Service configuration validation
    const validateServiceConfig = (serviceName, host, port, metadata) => {
        const errors = [];

        // Service name validation
        if (!serviceName || typeof serviceName !== 'string') {
            errors.push('serviceName is required and must be a string');
        } else if (serviceName.length > 100) {
            errors.push('serviceName must be less than 100 characters');
        } else if (!/^[a-zA-Z0-9_-]+$/.test(serviceName)) {
            errors.push('serviceName must contain only alphanumeric characters, hyphens, and underscores');
        }

        // Host validation
        if (!host || typeof host !== 'string') {
            errors.push('host is required and must be a string');
        } else if (host.length > 253) {
            errors.push('host must be less than 253 characters');
        }

        // Port validation
        if (typeof port !== 'number' || port < 1 || port > 65535) {
            errors.push('port must be a number between 1 and 65535');
        }

        // Metadata validation
        if (metadata) {
            if (typeof metadata !== 'object') {
                errors.push('metadata must be an object');
            } else {
                // Version validation
                if (metadata.version && (typeof metadata.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(metadata.version))) {
                    errors.push('version must be a semantic version string (e.g., 1.0.0)');
                }

                // Weight validation
                if (metadata.weight !== undefined && (typeof metadata.weight !== 'number' || metadata.weight < 1 || metadata.weight > 10)) {
                    errors.push('weight must be a number between 1 and 10');
                }

                // Tags validation
                if (metadata.tags) {
                    if (!Array.isArray(metadata.tags)) {
                        errors.push('tags must be an array');
                    } else if (metadata.tags.length > 10) {
                        errors.push('tags array must have at most 10 elements');
                    } else if (!metadata.tags.every(tag => typeof tag === 'string' && tag.length <= 50)) {
                        errors.push('each tag must be a string of at most 50 characters');
                    }
                }

                // Health check validation
                if (metadata.healthCheck) {
                    const hc = metadata.healthCheck;
                    if (typeof hc !== 'object') {
                        errors.push('healthCheck must be an object');
                    } else {
                        if (hc.url && typeof hc.url !== 'string') {
                            errors.push('healthCheck.url must be a string');
                        }
                        if (hc.interval !== undefined && (typeof hc.interval !== 'number' || hc.interval < 1000)) {
                            errors.push('healthCheck.interval must be a number >= 1000ms');
                        }
                        if (hc.timeout !== undefined && (typeof hc.timeout !== 'number' || hc.timeout < 100)) {
                            errors.push('healthCheck.timeout must be a number >= 100ms');
                        }
                    }
                }
            }
        }

        return errors;
    };

    // Handler functions - only core features for lightning speed
    // Handle service registration
    const handleRegister = (req, res, query, body) => {
        try {
            const { serviceName, host, port, metadata } = body;
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';

            // Validate configuration
            const validationErrors = validateServiceConfig(serviceName, host, port, metadata);
            if (validationErrors.length > 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Validation failed', details: validationErrors }));
                return;
            }

            const nodeId = serviceRegistry.register(serviceName, { host, port, metadata });
            // winston.info(`AUDIT: Service registered - serviceName: ${serviceName}, host: ${host}, port: ${port}, nodeId: ${nodeId}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            let responseObj = responsePool.get('register');
            if (!responseObj) {
                responseObj = { nodeId: '', status: 'registered' };
            }
            responseObj.nodeId = nodeId;
            res.end(stringifyRegister(responseObj));
            responsePool.put('register', responseObj);
        } catch (error) {
            // winston.error(`AUDIT: Registration failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            let responseObj = responsePool.get('success');
            if (!responseObj) {
                responseObj = { success: true };
            }
            responseObj.success = success;
            res.end(stringifySuccess(responseObj));
            responsePool.put('success', responseObj);
        } catch (error) {
            // winston.error(`AUDIT: Heartbeat failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.error(`AUDIT: Deregistration failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    // Handle service discovery - optimized for lightning mode performance
    const handleDiscover = async (req, res, query, body) => {
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

            // Handle version resolution and traffic distribution (optimized for performance)
            let fullServiceName = serviceName;
            if (version) {
                if (version === 'latest') {
                    const latest = serviceRegistry.getLatestVersion(serviceName);
                    if (latest) {
                        fullServiceName = `${serviceName}:${latest}`;
                    }
                } else {
                    fullServiceName = `${serviceName}:${version}`;
                }
            }

            // Check for traffic distribution (canary deployments)
            const distribution = serviceRegistry.getTrafficDistribution ? serviceRegistry.getTrafficDistribution(serviceName) : {};
            if (Object.keys(distribution).length > 0) {
                const rand = fastRandom() * 100;
                let cumulative = 0;
                for (const [ver, percent] of Object.entries(distribution)) {
                    cumulative += percent;
                    if (rand <= cumulative) {
                        fullServiceName = `${serviceName}:${ver}`;
                        break;
                    }
                }
            }

            // Use ultra-fast method for maximum performance in lightning mode
            const node = await serviceRegistry.ultraFastGetRandomNode(fullServiceName, strategy, clientIP, tags);
            if (!node) {
                // winston.info(`AUDIT: Service discovery failed - serviceName: ${serviceName}, version: ${version}, strategy: ${strategy}, tags: ${tags}, clientIP: ${clientIP}`);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(serviceUnavailable);
                return;
            }

            // Apply chaos engineering
            const chaos = chaosState.get(serviceName);
            if (chaos) {
                // Simulate failure
                if (chaos.failureRate > 0 && Math.random() < chaos.failureRate) {
                    res.writeHead(503, { 'Content-Type': 'application/json' });
                    res.end('{"error": "Service temporarily unavailable (chaos)"}');
                    return;
                }
                // Simulate latency
                if (chaos.latency > 0) {
                    await new Promise(resolve => setTimeout(resolve, chaos.latency));
                }
            }

            // winston.info(`AUDIT: Service discovered - serviceName: ${fullServiceName}, strategy: ${strategy}, tags: ${tags}, node: ${node.nodeName}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            let responseObj = responsePool.get('discover');
            if (!responseObj) {
                responseObj = { address: '', nodeName: '', healthy: true };
            }
            responseObj.address = node.address;
            responseObj.nodeName = node.nodeName;
            res.end(stringifyDiscover(responseObj));
            responsePool.put('discover', responseObj);
        } catch (error) {
            // winston.error(`AUDIT: Discovery failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.error(`AUDIT: Services list failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            let responseObj = responsePool.get('health');
            if (!responseObj) {
                responseObj = { status: 'ok', services: 0, nodes: 0 };
            }
            responseObj.services = services;
            responseObj.nodes = nodes;
            res.end(stringifyHealth(responseObj));
            responsePool.put('health', responseObj);
        } catch (error) {
            // winston.error(`AUDIT: Health check failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            let responseObj = responsePool.get('metrics');
            if (!responseObj) {
                responseObj = { uptime: 0, requests: 0, errors: 0, services: 0, nodes: 0, persistenceEnabled: false, persistenceType: '', wsConnections: 0, eventsBroadcasted: 0, cacheHits: 0, cacheMisses: 0, redisCacheHits: 0, redisCacheMisses: 0 };
            }
            responseObj.uptime = uptime;
            responseObj.requests = requestCount;
            responseObj.errors = errorCount;
            responseObj.services = services;
            responseObj.nodes = nodes;
            responseObj.persistenceEnabled = persistenceEnabled;
            responseObj.persistenceType = persistenceType;
            responseObj.wsConnections = wsConnectionCount;
            responseObj.eventsBroadcasted = eventBroadcastCount;
            responseObj.cacheHits = serviceRegistry.cacheHits;
            responseObj.cacheMisses = serviceRegistry.cacheMisses;
            responseObj.redisCacheHits = serviceRegistry.redisCacheHits;
            responseObj.redisCacheMisses = serviceRegistry.redisCacheMisses;
            responseObj.redisCacheHits = serviceRegistry.redisCacheHits;
            responseObj.redisCacheMisses = serviceRegistry.redisCacheMisses;
            res.end(stringifyMetrics(responseObj));
            responsePool.put('metrics', responseObj);
        } catch (error) {
            // winston.error(`AUDIT: Metrics failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.error(`AUDIT: Signin failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Handle token refresh
    routes.set('POST /refresh-token', (req, res, query, body) => {
        try {
            const { token } = body;
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (!token) {
                winston.warn(`AUDIT: Token refresh failed - missing token, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing token"}');
                return;
            }
            const decoded = jwt.verify(token, config.jwtSecret);
            const newToken = jwt.sign({ username: decoded.username, role: decoded.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
            // winston.info(`AUDIT: Token refreshed - username: ${decoded.username}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ token: newToken }));
        } catch (error) {
            // winston.error(`AUDIT: Token refresh failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(errorUnauthorized);
        }
    });

    // OAuth2 routes
    if (config.oauth2Enabled && config.googleClientId && config.googleClientSecret) {
        routes.set('GET /auth/google', (req, res, query, body) => {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const state = jwt.sign({ ip: clientIP }, config.jwtSecret, { expiresIn: '10m' });
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${config.googleClientId}&redirect_uri=${encodeURIComponent('http://localhost:8080/auth/google/callback')}&scope=openid email profile&state=${state}`;
            res.writeHead(302, { 'Location': authUrl });
            res.end();
        });

        routes.set('GET /auth/google/callback', async (req, res, query, body) => {
            try {
                const { code, state } = query;
                if (!code || !state) {
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end('Missing code or state');
                    return;
                }
                // Verify state
                try {
                    jwt.verify(state, config.jwtSecret);
                } catch (err) {
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end('Invalid state');
                    return;
                }
                // Exchange code for token
                const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
                    client_id: config.googleClientId,
                    client_secret: config.googleClientSecret,
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: 'http://localhost:8080/auth/google/callback'
                });
                const { access_token, id_token } = tokenResponse.data;
                // Decode id_token for user info
                const user = jwt.decode(id_token);
                // Create JWT for user
                const userToken = jwt.sign({ id: user.sub, email: user.email, name: user.name }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ token: userToken, user: { id: user.sub, email: user.email, name: user.name } }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('OAuth error');
            }
        });
    }

    // SAML routes
    if (config.samlEnabled && config.samlEntryPoint && config.samlIssuer && config.samlCert) {
        routes.set('GET /auth/saml', (req, res, query, body) => {
            passport.authenticate('saml')(req, res);
        });

        routes.set('POST /auth/saml/callback', (req, res, query, body) => {
            passport.authenticate('saml', (err, user, info) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('SAML authentication error');
                    return;
                }
                if (!user) {
                    res.writeHead(401, { 'Content-Type': 'text/plain' });
                    res.end('SAML authentication failed');
                    return;
                }
                // Create JWT for user
                const userToken = jwt.sign({ id: user.nameID, email: user.email, name: user.displayName }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ token: userToken, user: { id: user.nameID, email: user.email, name: user.displayName } }));
            })(req, res);
        });
    }

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
            // winston.info(`AUDIT: Registry backup performed - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (error) {
            // winston.error(`AUDIT: Backup failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.info(`AUDIT: Registry restore performed - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"success": true}');
        } catch (error) {
            // winston.error(`AUDIT: Restore failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.info(`AUDIT: Trace started - id: ${id}, operation: ${operation}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"success": true}');
        } catch (error) {
            // winston.error(`AUDIT: Trace start failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
        // winston.info(`AUDIT: Trace event added - id: ${id}, event: ${event}, clientIP: ${clientIP}`);
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
        // winston.info(`AUDIT: Trace ended - id: ${id}, clientIP: ${clientIP}`);
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
        // winston.info(`AUDIT: Trace retrieved - id: ${id}, clientIP: ${clientIP}`);
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
            // winston.info(`AUDIT: Config set - serviceName: ${serviceName}, key: ${key}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(configResult));
        } catch (error) {
            // winston.error(`AUDIT: Config set failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
                // winston.info(`AUDIT: Config get - not found, serviceName: ${serviceName}, key: ${key}, clientIP: ${clientIP}`);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end('{"error": "Config not found"}');
                return;
            }
            // winston.info(`AUDIT: Config get - serviceName: ${serviceName}, key: ${key}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(configValue));
        } catch (error) {
            // winston.error(`AUDIT: Config get failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.info(`AUDIT: Config all - serviceName: ${serviceName}, count: ${Object.keys(configs).length}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(configs));
        } catch (error) {
            // winston.error(`AUDIT: Config all failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
                // winston.info(`AUDIT: Config delete - not found, serviceName: ${serviceName}, key: ${key}, clientIP: ${clientIP}`);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end('{"error": "Config not found"}');
                return;
            }
            // winston.info(`AUDIT: Config delete - serviceName: ${serviceName}, key: ${key}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            // winston.error(`AUDIT: Config delete failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Handle record response time for predictive load balancing
    routes.set('POST /record-response-time', (req, res, query, body) => {
        try {
            const { nodeId, responseTime } = body;
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (!nodeId || responseTime == null) {
                winston.warn(`AUDIT: Invalid record response time - missing nodeId or responseTime, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing nodeId or responseTime"}');
                return;
            }
            serviceRegistry.recordResponseTime(nodeId, responseTime);
            // winston.info(`AUDIT: Response time recorded - nodeId: ${nodeId}, responseTime: ${responseTime}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            // winston.error(`AUDIT: Record response time failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Handle record call for dependency auto-detection
    routes.set('POST /record-call', (req, res, query, body) => {
        try {
            const { callerService, calledService } = body;
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            if (!callerService || !calledService) {
                winston.warn(`AUDIT: Invalid record call - missing callerService or calledService, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing callerService or calledService"}');
                return;
            }
            serviceRegistry.recordCall(callerService, calledService);
            // winston.info(`AUDIT: Call recorded - caller: ${callerService}, called: ${calledService}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            console.error(`AUDIT: Record call failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.info(`AUDIT: Envoy config requested - services: ${services.size}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(envoyConfig, null, 2));
        } catch (error) {
            // winston.error(`AUDIT: Envoy config failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    // Handle Istio service mesh config generation with AI optimization
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

                // AI-optimized policies based on traffic patterns and error rates
                const errorRate = serviceRegistry.getErrorRate ? serviceRegistry.getErrorRate(serviceName) : 0.05; // Default 5%
                const avgResponseTime = serviceRegistry.getAvgResponseTime ? serviceRegistry.getAvgResponseTime(serviceName) : 100; // Default 100ms
                const trafficVolume = serviceRegistry.getTrafficVolume ? serviceRegistry.getTrafficVolume(serviceName) : 1000; // Default requests/min

                // Intelligent circuit breaker settings
                const circuitBreaker = {
                    connectionPool: {
                        tcp: { maxConnections: Math.max(10, Math.min(100, Math.floor(trafficVolume / 10))) },
                        http: {
                            http2MaxRequests: Math.max(10, Math.min(100, Math.floor(trafficVolume / 10))),
                            maxRequestsPerConnection: 10
                        }
                    },
                    outlierDetection: {
                        consecutive5xxErrors: Math.max(1, Math.floor(errorRate * 10)),
                        interval: '10s',
                        baseEjectionTime: '30s',
                        maxEjectionPercent: Math.min(50, Math.max(10, errorRate * 100))
                    }
                };

                // Intelligent retry policy
                const retryPolicy = {
                    attempts: Math.max(1, Math.min(5, Math.floor(errorRate * 10) + 1)),
                    perTryTimeout: `${Math.max(1, avgResponseTime / 1000)}s`,
                    retryOn: errorRate > 0.1 ? '5xx,connect-failure' : 'connect-failure'
                };

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
                            }],
                            retries: retryPolicy,
                            timeout: `${Math.max(5, avgResponseTime * 2 / 1000)}s`
                        }]
                    }
                };

                const destinationRule = {
                    apiVersion: 'networking.istio.io/v1alpha3',
                    kind: 'DestinationRule',
                    metadata: { name: serviceName },
                    spec: {
                        host: serviceName,
                        subsets: subsets,
                        trafficPolicy: {
                            connectionPool: circuitBreaker.connectionPool,
                            outlierDetection: circuitBreaker.outlierDetection,
                            tls: { mode: 'ISTIO_MUTUAL' }
                        }
                    }
                };

                configs.push({ virtualService, destinationRule });
            }
            // winston.info(`AUDIT: AI-optimized Istio config requested - services: ${services.size}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(configs, null, 2));
        } catch (error) {
            // winston.error(`AUDIT: Istio config failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    // Handle Linkerd service mesh config generation with AI optimization
    const handleLinkerdConfig = (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const services = serviceRegistry.getAllServices();
            const configs = [];
            for (const [serviceName, nodes] of services) {
                const routes = [];
                // Generate routes based on common patterns or metadata
                // For simplicity, add a default route
                routes.push({
                    name: 'default',
                    condition: {
                        pathRegex: '.*'
                    }
                });

                // AI-optimized retry budget based on traffic patterns and error rates
                const errorRate = serviceRegistry.getErrorRate ? serviceRegistry.getErrorRate(serviceName) : 0.05; // Default 5%
                const trafficVolume = serviceRegistry.getTrafficVolume ? serviceRegistry.getTrafficVolume(serviceName) : 1000; // Default requests/min

                // Intelligent retry budget
                const retryBudget = {
                    retryRatio: Math.min(0.5, Math.max(0.1, errorRate * 2)), // Higher error rate = more retries
                    minRetriesPerSecond: Math.max(1, Math.floor(trafficVolume / 100)), // Scale with traffic
                    ttl: errorRate > 0.1 ? '30s' : '10s' // Longer TTL for high error services
                };

                const serviceProfile = {
                    apiVersion: 'linkerd.io/v1alpha2',
                    kind: 'ServiceProfile',
                    metadata: {
                        name: `${serviceName}.default.svc.cluster.local`,
                        namespace: 'default'
                    },
                    spec: {
                        routes: routes,
                        retryBudget: retryBudget
                    }
                };
                configs.push(serviceProfile);
            }
            // winston.info(`AUDIT: AI-optimized Linkerd config requested - services: ${services.size}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(configs, null, 2));
        } catch (error) {
            // winston.error(`AUDIT: Linkerd config failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    };

    routes.set('GET /service-mesh/envoy-config', handleEnvoyConfig);
    routes.set('GET /service-mesh/istio-config', handleIstioConfig);
    routes.set('GET /service-mesh/linkerd-config', handleLinkerdConfig);

    // Chaos Engineering Tools
    const chaosState = new Map(); // serviceName -> { latency: ms, failureRate: 0-1, partition: boolean }

    routes.set('POST /api/maxine/chaos/inject-latency', (req, res, query, body) => {
        try {
            const { serviceName, delay } = body;
            if (!serviceName || typeof delay !== 'number') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName or invalid delay"}');
                return;
            }
            if (!chaosState.has(serviceName)) {
                chaosState.set(serviceName, { latency: 0, failureRate: 0, partition: false });
            }
            chaosState.get(serviceName).latency = delay;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"success": true}');
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('POST /api/maxine/chaos/inject-failure', (req, res, query, body) => {
        try {
            const { serviceName, rate } = body;
            if (!serviceName || typeof rate !== 'number' || rate < 0 || rate > 1) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName or invalid rate (0-1)"}');
                return;
            }
            if (!chaosState.has(serviceName)) {
                chaosState.set(serviceName, { latency: 0, failureRate: 0, partition: false });
            }
            chaosState.get(serviceName).failureRate = rate;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"success": true}');
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('POST /api/maxine/chaos/reset', (req, res, query, body) => {
        try {
            const { serviceName } = body;
            if (serviceName) {
                chaosState.delete(serviceName);
            } else {
                chaosState.clear();
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"success": true}');
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('GET /api/maxine/chaos/status', (req, res, query, body) => {
        try {
            const status = {};
            for (const [serviceName, state] of chaosState) {
                status[serviceName] = state;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ chaosState: status }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

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
            // winston.info(`AUDIT: Versions requested - serviceName: ${serviceName}, versions: ${versions.join(',')}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ serviceName, versions }));
        } catch (error) {
            // winston.error(`AUDIT: Versions failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Open Service Broker API integration
    routes.set('GET /v2/catalog', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const services = serviceRegistry.getAllServices();
            const catalog = {
                services: Array.from(services, ([serviceName, nodes]) => {
                    const versions = serviceRegistry.getVersions(serviceName);
                    return {
                        id: serviceName,
                        name: serviceName,
                        description: `Service ${serviceName}`,
                        bindable: false,
                        plans: versions.map(v => ({
                            id: `${serviceName}-${v}`,
                            name: v,
                            description: `Version ${v} of ${serviceName}`
                        }))
                    };
                })
            };
            // winston.info(`AUDIT: OSB catalog requested - services: ${catalog.services.length}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(catalog));
        } catch (error) {
            // winston.error(`AUDIT: OSB catalog failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('GET /anomalies', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const anomalies = serviceRegistry.getAnomalies();
            // winston.info(`AUDIT: Anomalies requested - count: ${anomalies.length}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ anomalies }));
        } catch (error) {
            // winston.error(`AUDIT: Anomalies failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('GET /health-score', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const serviceName = query.serviceName;
            if (!serviceName) {
                winston.warn(`AUDIT: Invalid health score request - missing serviceName, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName"}');
                return;
            }
            const scores = serviceRegistry.getHealthScores(serviceName);
            // winston.info(`AUDIT: Health scores requested - serviceName: ${serviceName}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ serviceName, scores }));
        } catch (error) {
            // winston.error(`AUDIT: Health scores failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('GET /predict-health', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const serviceName = query.serviceName;
            const window = query.window ? parseInt(query.window) : 300000; // 5 minutes default
            if (!serviceName) {
                winston.warn(`AUDIT: Invalid predict health request - missing serviceName, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName"}');
                return;
            }
            const predictions = serviceRegistry.predictServiceHealth(serviceName, window);
            // winston.info(`AUDIT: Health prediction requested - serviceName: ${serviceName}, window: ${window}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ serviceName, predictions, predictionWindow: window }));
        } catch (error) {
            // winston.error(`AUDIT: Health prediction failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('GET /anomalies', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const anomalies = serviceRegistry.getAnomalies();
            // winston.info(`AUDIT: Anomalies requested - count: ${anomalies.length}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ anomalies }));
        } catch (error) {
            // winston.error(`AUDIT: Anomalies failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.info(`AUDIT: Traffic set - serviceName: ${serviceName}, distribution: ${JSON.stringify(distribution)}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            // winston.error(`AUDIT: Traffic set failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.info(`AUDIT: Version promoted - serviceName: ${serviceName}, version: ${version}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            // winston.error(`AUDIT: Version promote failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.info(`AUDIT: Version retired - serviceName: ${serviceName}, version: ${version}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            // winston.error(`AUDIT: Version retire failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.info(`AUDIT: Traffic shifted - serviceName: ${serviceName}, from: ${fromVersion}, to: ${toVersion}, percentage: ${percentage}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            // winston.error(`AUDIT: Traffic shift failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.info(`AUDIT: Circuit breaker state requested - nodeId: ${nodeId}, state: ${JSON.stringify(state)}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state));
        } catch (error) {
            // winston.error(`AUDIT: Circuit breaker state failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.info(`AUDIT: Event history requested - since: ${since}, limit: ${limit}, returned: ${filtered.length}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(filtered));
        } catch (error) {
            // winston.error(`AUDIT: Event history failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Service blacklist endpoints
    routes.set('POST /blacklist/add', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const { serviceName } = body;
            if (!serviceName) {
                winston.warn(`AUDIT: Invalid blacklist add - missing serviceName, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName"}');
                return;
            }
            serviceRegistry.addToBlacklist(serviceName);
            // winston.info(`AUDIT: Service added to blacklist - serviceName: ${serviceName}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            // winston.error(`AUDIT: Blacklist add failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('DELETE /blacklist/remove', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const { serviceName } = body;
            if (!serviceName) {
                winston.warn(`AUDIT: Invalid blacklist remove - missing serviceName, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName"}');
                return;
            }
            serviceRegistry.removeFromBlacklist(serviceName);
            // winston.info(`AUDIT: Service removed from blacklist - serviceName: ${serviceName}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            // winston.error(`AUDIT: Blacklist remove failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('GET /blacklist', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const blacklist = serviceRegistry.getBlacklist();
            // winston.info(`AUDIT: Blacklist requested - count: ${blacklist.length}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ blacklist }));
        } catch (error) {
            // winston.error(`AUDIT: Blacklist get failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Simple dashboard endpoint
    routes.set('GET /dashboard', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const uptime = process.uptime();
            const services = serviceRegistry.servicesCount;
            const nodes = serviceRegistry.nodesCount;
            const wsConnections = wsConnectionCount;
            const eventsBroadcasted = eventBroadcastCount;
            const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Maxine Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { margin: 10px 0; }
        .metric span { font-weight: bold; }
    </style>
</head>
<body>
    <h1>Maxine Service Registry Dashboard</h1>
    <div class="metric">Uptime: <span>${Math.floor(uptime)}s</span></div>
    <div class="metric">Services: <span>${services}</span></div>
    <div class="metric">Nodes: <span>${nodes}</span></div>
    <div class="metric">WebSocket Connections: <span>${wsConnections}</span></div>
    <div class="metric">Events Broadcasted: <span>${eventsBroadcasted}</span></div>
    <h2>Recent Events</h2>
    <ul>
        ${eventHistory.slice(-10).map(e => `<li>${new Date(e.timestamp).toISOString()}: ${e.event}</li>`).join('')}
    </ul>
</body>
</html>`;
            // winston.info(`AUDIT: Dashboard requested - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
        } catch (error) {
            // winston.error(`AUDIT: Dashboard failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    });

    // Service Call Analytics Dashboard
    routes.set('GET /analytics', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const { serviceName, timeRange = 3600000 } = query; // Default 1 hour
            const now = Date.now();
            const cutoff = now - parseInt(timeRange);

            const callLogs = serviceRegistry.getCallLogs ? serviceRegistry.getCallLogs() : {};
            const analytics = {};

            // Process call logs
            for (const [caller, calls] of Object.entries(callLogs)) {
                if (serviceName && caller !== serviceName) continue;

                analytics[caller] = {
                    totalCalls: 0,
                    uniqueServices: new Set(),
                    callFrequency: {},
                    recentCalls: [],
                    topCalledServices: []
                };

                for (const [called, data] of calls) {
                    if (data.lastSeen >= cutoff) {
                        analytics[caller].totalCalls += data.count;
                        analytics[caller].uniqueServices.add(called);

                        // Call frequency (calls per minute)
                        const minutesAgo = Math.floor((now - data.lastSeen) / 60000);
                        if (!analytics[caller].callFrequency[minutesAgo]) {
                            analytics[caller].callFrequency[minutesAgo] = 0;
                        }
                        analytics[caller].callFrequency[minutesAgo] += data.count;

                        analytics[caller].recentCalls.push({
                            calledService: called,
                            count: data.count,
                            lastSeen: data.lastSeen
                        });
                    }
                }

                // Sort top called services
                analytics[caller].topCalledServices = analytics[caller].recentCalls
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 10);

                analytics[caller].uniqueServices = Array.from(analytics[caller].uniqueServices);
            }

            // Generate HTML dashboard
            const services = Object.keys(analytics);
            const totalCalls = services.reduce((sum, svc) => sum + analytics[svc].totalCalls, 0);
            const totalServices = services.length;

            const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Maxine Service Call Analytics</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stats { display: flex; gap: 20px; margin: 20px 0; }
        .stat-card { background: white; padding: 15px; border-radius: 8px; flex: 1; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .service-card { background: white; margin: 10px 0; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .chart { margin: 20px 0; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .call-graph { width: 100%; height: 400px; }
        .top-services { margin: 20px 0; }
        .service-link { stroke: #999; stroke-opacity: 0.6; }
        .service-node { fill: #69b3a2; }
        .service-node:hover { fill: #4a8b7a; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Maxine Service Call Analytics Dashboard</h1>
        <p>Real-time service communication analysis${serviceName ? ` for ${serviceName}` : ''}</p>
    </div>

    <div class="stats">
        <div class="stat-card">
            <h3>${totalServices}</h3>
            <p>Active Services</p>
        </div>
        <div class="stat-card">
            <h3>${totalCalls}</h3>
            <p>Total Calls (${timeRange / 3600000}h)</p>
        </div>
        <div class="stat-card">
            <h3>${(totalCalls / Math.max(timeRange / 3600000, 1)).toFixed(1)}</h3>
            <p>Calls per Hour</p>
        </div>
    </div>

    <div class="chart">
        <h2>Service Call Graph</h2>
        <svg class="call-graph" id="callGraph"></svg>
    </div>

    <div class="top-services">
        <h2>Service Details</h2>
        ${services.map(service => `
            <div class="service-card">
                <h3>${service}</h3>
                <div style="display: flex; gap: 20px; margin: 10px 0;">
                    <div><strong>Total Calls:</strong> ${analytics[service].totalCalls}</div>
                    <div><strong>Unique Services:</strong> ${analytics[service].uniqueServices.length}</div>
                </div>
                <div style="margin: 10px 0;">
                    <strong>Top Called Services:</strong>
                    <ul>
                        ${analytics[service].topCalledServices.slice(0, 5).map(call => `
                            <li>${call.calledService}: ${call.count} calls</li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        `).join('')}
    </div>

    <script>
        const analytics = ${JSON.stringify(analytics)};

        // Create service call graph
        function createCallGraph() {
            const svg = d3.select('#callGraph');
            const width = svg.node().getBoundingClientRect().width;
            const height = 400;

            svg.attr('viewBox', [0, 0, width, height]);

            // Prepare data
            const nodes = [];
            const links = [];
            const serviceIndex = {};

            Object.keys(analytics).forEach((service, i) => {
                if (!serviceIndex[service]) {
                    serviceIndex[service] = nodes.length;
                    nodes.push({ id: service, group: 1 });
                }

                analytics[service].recentCalls.forEach(call => {
                    if (!serviceIndex[call.calledService]) {
                        serviceIndex[call.calledService] = nodes.length;
                        nodes.push({ id: call.calledService, group: 2 });
                    }

                    links.push({
                        source: serviceIndex[service],
                        target: serviceIndex[call.calledService],
                        value: Math.log(call.count + 1) * 2 // Log scale for better visualization
                    });
                });
            });

            // Create force simulation
            const simulation = d3.forceSimulation(nodes)
                .force('link', d3.forceLink(links).id(d => d.id).distance(100))
                .force('charge', d3.forceManyBody().strength(-300))
                .force('center', d3.forceCenter(width / 2, height / 2))
                .force('x', d3.forceX(width / 2).strength(0.1))
                .force('y', d3.forceY(height / 2).strength(0.1));

            // Draw links
            const link = svg.append('g')
                .selectAll('line')
                .data(links)
                .enter().append('line')
                .attr('class', 'service-link')
                .attr('stroke-width', d => Math.sqrt(d.value));

            // Draw nodes
            const node = svg.append('g')
                .selectAll('circle')
                .data(nodes)
                .enter().append('circle')
                .attr('class', 'service-node')
                .attr('r', 8)
                .call(d3.drag()
                    .on('start', dragstarted)
                    .on('drag', dragged)
                    .on('end', dragended));

            // Add labels
            const label = svg.append('g')
                .selectAll('text')
                .data(nodes)
                .enter().append('text')
                .text(d => d.id)
                .attr('font-size', 10)
                .attr('dx', 12)
                .attr('dy', 4);

            simulation.on('tick', () => {
                link
                    .attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);

                node
                    .attr('cx', d => d.x)
                    .attr('cy', d => d.y);

                label
                    .attr('x', d => d.x)
                    .attr('y', d => d.y);
            });

            function dragstarted(event, d) {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            }

            function dragged(event, d) {
                d.fx = event.x;
                d.fy = event.y;
            }

            function dragended(event, d) {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            }
        }

        // Initialize
        if (Object.keys(analytics).length > 0) {
            createCallGraph();
        }
    </script>
</body>
</html>`;
            // winston.info(`AUDIT: Analytics dashboard requested - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
        } catch (error) {
            // winston.error(`AUDIT: Analytics failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    });

    // Dependency Graph Visualization
    routes.set('GET /dependency-graph', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const graph = serviceRegistry.getDependencyGraph();
            const cycles = serviceRegistry.detectCycles();
            const callLogs = serviceRegistry.getCallLogs();
            const graphJson = JSON.stringify(graph);
            const cyclesJson = JSON.stringify(cycles);
            const callLogsJson = JSON.stringify(callLogs);
            const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Maxine Dependency Graph</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .node { fill: #69b3a2; }
        .link { stroke: #999; stroke-opacity: 0.6; }
        .cycle-alert { color: red; font-weight: bold; }
        #graph { border: 1px solid #ccc; }
    </style>
</head>
<body>
    <h1>Maxine Service Dependency Graph & Analytics</h1>
    <div id="cycle-alert" class="cycle-alert" style="display: none;">Warning: Circular dependencies detected!</div>
    <div id="stats"></div>
    <div>
        <button onclick="exportJSON()">Export JSON</button>
        <button onclick="exportSVG()">Export SVG</button>
    </div>
    <svg id="graph" width="800" height="600"></svg>
    <script>
        const graphData = ${graphJson};
        const cycles = ${cyclesJson};
        const callLogs = ${callLogsJson};

        if (cycles.length > 0) {
            document.getElementById('cycle-alert').style.display = 'block';
        }

        // Calculate and display stats (will be updated after graph setup)
        const totalCalls = Object.values(callLogs).reduce((sum, calls) =>
            sum + Object.values(calls).reduce((s, c) => s + c.count, 0), 0);

        // Prepare nodes and links
        const nodes = [];
        const links = [];
        const nodeMap = new Map();

        Object.keys(graphData).forEach(service => {
            if (!nodeMap.has(service)) {
                nodeMap.set(service, { id: service, group: 1 });
                nodes.push(nodeMap.get(service));
            }
            graphData[service].forEach(dep => {
                if (!nodeMap.has(dep)) {
                    nodeMap.set(dep, { id: dep, group: 1 });
                    nodes.push(nodeMap.get(dep));
                }
                const callCount = callLogs[service] && callLogs[service][dep] ? callLogs[service][dep].count : 0;
                links.push({ source: service, target: dep, callCount });
            });
        });

        const svg = d3.select("#graph");
        const width = +svg.attr("width");
        const height = +svg.attr("height");

        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2));

        const link = svg.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(links)
            .enter().append("line")
            .attr("class", "link")
            .attr("stroke-width", d => Math.max(1, Math.log(d.callCount + 1)));

        link.append("title")
            .text(d => d.source + ' -> ' + d.target + ': ' + d.callCount + ' calls');

        const node = svg.append("g")
            .attr("class", "nodes")
            .selectAll("circle")
            .data(nodes)
            .enter().append("circle")
            .attr("class", "node")
            .attr("r", 10)
            .on("click", (event, d) => showImpact(d.id))
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        node.append("title")
            .text(d => d.id);

        const text = svg.append("g")
            .selectAll("text")
            .data(nodes)
            .enter().append("text")
            .attr("dy", -15)
            .text(d => d.id);

        simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);

            text
                .attr("x", d => d.x)
                .attr("y", d => d.y);
        });

        // Update stats
        const statsDiv = document.getElementById('stats');
        statsDiv.innerHTML = '<p><strong>Total Services:</strong> ' + nodes.length + '</p>' +
            '<p><strong>Total Dependencies:</strong> ' + links.length + '</p>' +
            '<p><strong>Total Service Calls:</strong> ' + totalCalls + '</p>' +
            '<p><strong>Link thickness represents call volume (log scale)</strong></p>';

        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }

        function showImpact(serviceName) {
            // Fetch dependencies and dependents via API
            fetch('/api/maxine/serviceops/dependency/get?serviceName=' + encodeURIComponent(serviceName))
                .then(response => response.json())
                .then(data => {
                    const dependencies = data.dependencies;
                    fetch('/api/maxine/serviceops/dependency/dependents?serviceName=' + encodeURIComponent(serviceName))
                        .then(response => response.json())
                        .then(data2 => {
                            const dependents = data2.dependents;
                            alert('Service: ' + serviceName + '\nDepends on: ' + (dependencies.join(', ') || 'none') + '\nDepended by: ' + (dependents.join(', ') || 'none'));
                        });
                });
        }

        function exportJSON() {
            const dataStr = JSON.stringify(graphData, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            const exportFileDefaultName = 'dependency-graph.json';
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
        }

        function exportSVG() {
            const svg = document.getElementById('graph');
            const serializer = new XMLSerializer();
            const svgStr = serializer.serializeToString(svg);
            const dataUri = 'data:image/svg+xml;charset=utf-8,'+ encodeURIComponent(svgStr);
            const exportFileDefaultName = 'dependency-graph.svg';
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
        }
    </script>
</body>
</html>`;
            // winston.info(`AUDIT: Dependency graph requested - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
        } catch (error) {
            // winston.error(`AUDIT: Dependency graph failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    });

    // Actuator endpoints for compatibility
    // Handle actuator health check
    routes.set('GET /api/actuator/health', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            // winston.info(`AUDIT: Actuator health requested - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"status": "UP"}');
        } catch (error) {
            // winston.error(`AUDIT: Actuator health failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });
    // Handle actuator info
    routes.set('GET /api/actuator/info', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            // winston.info(`AUDIT: Actuator info requested - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"build": {"description": "Maxine Lightning Mode", "name": "maxine-discovery"}}');
        } catch (error) {
            // winston.error(`AUDIT: Actuator info failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.info(`AUDIT: Actuator metrics requested - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ mem, uptime }));
        } catch (error) {
            // winston.error(`AUDIT: Actuator metrics failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.info(`AUDIT: Logs download requested - clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{}');
        } catch (error) {
            // winston.error(`AUDIT: Logs download failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.info(`AUDIT: Config get requested - clientIP: ${clientIP}`);
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
            // winston.error(`AUDIT: Config get failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
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
            // winston.info(`AUDIT: Config updated - key: ${key}, value: ${value}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ [key]: "Success" }));
        } catch (error) {
            // winston.error(`AUDIT: Config update failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Service dependency endpoints
    routes.set('POST /api/maxine/serviceops/dependency/add', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const { serviceName, dependsOn } = body;
            if (!serviceName || !dependsOn) {
                winston.warn(`AUDIT: Invalid dependency add - missing serviceName or dependsOn, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName or dependsOn"}');
                return;
            }
            serviceRegistry.addDependency(serviceName, dependsOn);
            global.broadcast('dependency_added', { serviceName, dependsOn });
            // winston.info(`AUDIT: Dependency added - serviceName: ${serviceName}, dependsOn: ${dependsOn}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            // winston.error(`AUDIT: Dependency add failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('POST /api/maxine/serviceops/dependency/remove', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const { serviceName, dependsOn } = body;
            if (!serviceName || !dependsOn) {
                winston.warn(`AUDIT: Invalid dependency remove - missing serviceName or dependsOn, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName or dependsOn"}');
                return;
            }
            serviceRegistry.removeDependency(serviceName, dependsOn);
            global.broadcast('dependency_removed', { serviceName, dependsOn });
            // winston.info(`AUDIT: Dependency removed - serviceName: ${serviceName}, dependsOn: ${dependsOn}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            // winston.error(`AUDIT: Dependency remove failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('GET /api/maxine/serviceops/dependency/get', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const serviceName = query.serviceName;
            if (!serviceName) {
                winston.warn(`AUDIT: Invalid dependency get - missing serviceName, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName"}');
                return;
            }
            const dependencies = serviceRegistry.getDependencies(serviceName);
            // winston.info(`AUDIT: Dependencies retrieved - serviceName: ${serviceName}, count: ${dependencies.length}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ serviceName, dependencies }));
        } catch (error) {
            // winston.error(`AUDIT: Dependency get failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('GET /api/maxine/serviceops/dependency/dependents', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const serviceName = query.serviceName;
            if (!serviceName) {
                winston.warn(`AUDIT: Invalid dependents get - missing serviceName, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName"}');
                return;
            }
            const dependents = serviceRegistry.getDependents(serviceName);
            // winston.info(`AUDIT: Dependents retrieved - serviceName: ${serviceName}, count: ${dependents.length}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ serviceName, dependents }));
        } catch (error) {
            // winston.error(`AUDIT: Dependents get failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('GET /api/maxine/serviceops/dependency/graph', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const graph = serviceRegistry.getDependencyGraph();
            // winston.info(`AUDIT: Dependency graph retrieved - services: ${Object.keys(graph).length}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(graph));
        } catch (error) {
            // winston.error(`AUDIT: Dependency graph failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('GET /api/maxine/serviceops/dependency/cycles', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const cycles = serviceRegistry.detectCycles();
            // winston.info(`AUDIT: Cycles detected - count: ${cycles.length}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ cycles }));
        } catch (error) {
            // winston.error(`AUDIT: Cycles detection failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // ACL endpoints
    routes.set('POST /api/maxine/serviceops/acl/set', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const { serviceName, allow, deny } = body;
            if (!serviceName) {
                winston.warn(`AUDIT: Invalid ACL set - missing serviceName, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing serviceName"}');
                return;
            }
            serviceRegistry.setACL(serviceName, allow, deny);
            // winston.info(`AUDIT: ACL set - serviceName: ${serviceName}, allow: ${allow}, deny: ${deny}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            // winston.error(`AUDIT: ACL set failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('GET /api/maxine/serviceops/acl/:serviceName', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const serviceName = req.url.split('/').pop();
            const acl = serviceRegistry.getACL(serviceName);
            // winston.info(`AUDIT: ACL retrieved - serviceName: ${serviceName}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(acl));
        } catch (error) {
            // winston.error(`AUDIT: ACL get failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    // Intention endpoints
    routes.set('POST /api/maxine/serviceops/intention/set', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const { source, destination, action } = body;
            if (!source || !destination || !action) {
                winston.warn(`AUDIT: Invalid intention set - missing parameters, clientIP: ${clientIP}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Missing source, destination, or action"}');
                return;
            }
            serviceRegistry.setIntention(source, destination, action);
            // winston.info(`AUDIT: Intention set - source: ${source}, destination: ${destination}, action: ${action}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(successTrue);
        } catch (error) {
            // winston.error(`AUDIT: Intention set failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
    });

    routes.set('GET /api/maxine/serviceops/intention/:source/:destination', (req, res, query, body) => {
        try {
            const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
            const parts = req.url.split('/');
            const source = parts[parts.length - 2];
            const destination = parts[parts.length - 1];
            const action = serviceRegistry.getIntention(source, destination);
            // winston.info(`AUDIT: Intention retrieved - source: ${source}, destination: ${destination}, action: ${action}, clientIP: ${clientIP}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ source, destination, action }));
        } catch (error) {
            // winston.error(`AUDIT: Intention get failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
            errorCount++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error": "Internal server error"}');
        }
      });

     // Compatibility endpoints
     routes.set('POST /api/maxine/serviceops/compatibility/set', (req, res, query, body) => {
         try {
             const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
             const { serviceName, version, compatibleVersions } = body;
             if (!serviceName || !version || !compatibleVersions) {
                 winston.warn(`AUDIT: Invalid compatibility set - missing parameters, clientIP: ${clientIP}`);
                 res.writeHead(400, { 'Content-Type': 'application/json' });
                 res.end('{"error": "Missing serviceName, version, or compatibleVersions"}');
                 return;
             }
             serviceRegistry.setCompatibilityRule(serviceName, version, compatibleVersions);
             // winston.info(`AUDIT: Compatibility rule set - serviceName: ${serviceName}, version: ${version}, compatibleVersions: ${JSON.stringify(compatibleVersions)}, clientIP: ${clientIP}`);
             res.writeHead(200, { 'Content-Type': 'application/json' });
             res.end(successTrue);
         } catch (error) {
             // winston.error(`AUDIT: Compatibility set failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
             errorCount++;
             res.writeHead(500, { 'Content-Type': 'application/json' });
             res.end('{"error": "Internal server error"}');
         }
     });

     routes.set('GET /api/maxine/serviceops/compatibility/get', (req, res, query, body) => {
         try {
             const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
             const serviceName = query.serviceName;
             const version = query.version;
             if (!serviceName) {
                 winston.warn(`AUDIT: Invalid compatibility get - missing serviceName, clientIP: ${clientIP}`);
                 res.writeHead(400, { 'Content-Type': 'application/json' });
                 res.end('{"error": "Missing serviceName"}');
                 return;
             }
             let rules;
             if (version) {
                 rules = serviceRegistry.getCompatibilityRule(serviceName, version);
             } else {
                 rules = serviceRegistry.getAllCompatibilityRules(serviceName);
             }
             // winston.info(`AUDIT: Compatibility rules retrieved - serviceName: ${serviceName}, version: ${version}, clientIP: ${clientIP}`);
             res.writeHead(200, { 'Content-Type': 'application/json' });
             res.end(JSON.stringify({ serviceName, version, rules }));
         } catch (error) {
             // winston.error(`AUDIT: Compatibility get failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
             errorCount++;
             res.writeHead(500, { 'Content-Type': 'application/json' });
             res.end('{"error": "Internal server error"}');
         }
     });

     routes.set('POST /api/maxine/serviceops/compatibility/check', (req, res, query, body) => {
         try {
             const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
             const { serviceName, version, requiredVersion } = body;
             if (!serviceName || !version || !requiredVersion) {
                 winston.warn(`AUDIT: Invalid compatibility check - missing parameters, clientIP: ${clientIP}`);
                 res.writeHead(400, { 'Content-Type': 'application/json' });
                 res.end('{"error": "Missing serviceName, version, or requiredVersion"}');
                 return;
             }
             const compatible = serviceRegistry.checkCompatibility(serviceName, version, requiredVersion);
             // winston.info(`AUDIT: Compatibility checked - serviceName: ${serviceName}, version: ${version}, requiredVersion: ${requiredVersion}, compatible: ${compatible}, clientIP: ${clientIP}`);
             res.writeHead(200, { 'Content-Type': 'application/json' });
             res.end(JSON.stringify({ serviceName, version, requiredVersion, compatible }));
         } catch (error) {
             // winston.error(`AUDIT: Compatibility check failed - error: ${error.message}, clientIP: ${req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'}`);
             errorCount++;
             res.writeHead(500, { 'Content-Type': 'application/json' });
             res.end('{"error": "Internal server error"}');
         }
     });

     let server;
     if (config.mtlsEnabled) {
         const httpsOptions = {
             cert: fs.readFileSync(config.serverCertPath),
             key: fs.readFileSync(config.serverKeyPath),
             ca: [fs.readFileSync(config.caCertPath)],
             requestCert: true,
             rejectUnauthorized: true
         };
         server = https.createServer(httpsOptions, (req, res) => {
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
              // winston.info(`AUDIT: Proxy request - serviceName: ${serviceName}, target: ${target}, path: ${path}, clientIP: ${clientIP}`);
              proxy.web(req, res, { target }, (err) => {
                  if (err) {
                      // winston.error(`AUDIT: Proxy error - serviceName: ${serviceName}, target: ${target}, error: ${err.message}, clientIP: ${clientIP}`);
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
    } else {
        server = http.createServer({ keepAlive: false }, (req, res) => {
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
              // winston.info(`AUDIT: Proxy request - serviceName: ${serviceName}, target: ${target}, path: ${path}, clientIP: ${clientIP}`);
              proxy.web(req, res, { target }, (err) => {
                  if (err) {
                      // winston.error(`AUDIT: Proxy error - serviceName: ${serviceName}, target: ${target}, error: ${err.message}, clientIP: ${clientIP}`);
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
    }

    if (!config.isTestMode || process.env.WEBSOCKET_ENABLED === 'true') {
        server.listen(constants.PORT, () => {
            console.log(`Maxine server started in lightning mode on port ${constants.PORT}`);
        });
    }

    // Start DNS server for service discovery
    if (process.env.DNS_ENABLED !== 'false') {
        const { startDNSServer } = require('./src/main/controller/maxine/dns-controller');
        startDNSServer(process.env.DNS_PORT || (process.env.NODE_ENV === 'test' ? 5353 : 53));
    }

        // WebSocket server for real-time event streaming
        let wss = null;
        if (config.websocketEnabled) {
            wss = new WebSocket.Server({ server });
        }

        // MQTT client for event publishing
        let mqttClient = null;
        if (config.mqttEnabled) {
            mqttClient = mqtt.connect(config.mqttBroker);
            mqttClient.on('connect', () => {
                // Connected to MQTT broker
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

        let clientFilters = new Map(); // ws -> filter object
        let clientAuth = new Map(); // ws -> user object or false

        const broadcast = (event, data) => {
            eventBroadcastCount++;
            const messageObj = { event, data, timestamp: Date.now() };
            const message = JSON.stringify(messageObj);
            // Store in history
            eventHistory.push(messageObj);
            if (eventHistory.length > maxHistory) {
                eventHistory.shift();
            }
            // Store in service registry for dashboard
            if (global.serviceRegistry && global.serviceRegistry.recentEvents) {
                global.serviceRegistry.recentEvents.push(messageObj);
                if (global.serviceRegistry.recentEvents.length > 100) {
                    global.serviceRegistry.recentEvents.shift();
                }
            }
            // Save to file periodically or on important events
            if (eventHistory.length % 100 === 0) {
                saveEventHistory();
            }
            // Emit to eventEmitter for SSE
            global.eventEmitter.emit(event, data);
            // Store last event for testing
            global.lastEvent = { event, data };
            // WebSocket broadcast with filtering - async to avoid blocking
        if (config.websocketEnabled) {
                process.nextTick(() => {
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            const filter = clientFilters.get(client);
                            if (matchesFilter(event, data, filter)) {
                                client.send(message);
                            }
                        }
                    });
                });
            }
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

        if (wss) {
        const clientFilters = new Map(); // ws -> filter object
        const clientAuth = new Map(); // ws -> user object or false

        wss.on('connection', (ws) => {
            wsConnectionCount++;
            clientFilters.set(ws, null); // no filter by default
            clientAuth.set(ws, config.authEnabled ? false : { role: 'anonymous' }); // user object or false

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    if (data.auth) {
                        if (config.authEnabled) {
                            try {
                                const decoded = jwt.verify(data.auth, config.jwtSecret);
                                clientAuth.set(ws, decoded);
                                ws.send(JSON.stringify({ type: 'authenticated', user: decoded }));
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
                        // Role check: only admin can subscribe to admin events
                        const user = clientAuth.get(ws);
                        if (data.subscribe.event === 'admin_event' && (!user || user.role !== 'admin')) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Insufficient permissions' }));
                            return;
                        }
                        clientFilters.set(ws, data.subscribe);
                        ws.send(JSON.stringify({ type: 'subscribed', filter: data.subscribe }));
                    } else if (data.unsubscribe) {
                        clientFilters.set(ws, null);
                        ws.send(JSON.stringify({ type: 'unsubscribed' }));
                    } else if (data.refresh_token) {
                        const user = clientAuth.get(ws);
                        if (!user) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
                            return;
                        }
                        try {
                            const newToken = jwt.sign({ username: user.username, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
                            ws.send(JSON.stringify({ type: 'token_refreshed', token: newToken }));
                        } catch (err) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Token refresh failed' }));
                        }
                    }
                } catch (e) {
                    // ignore invalid messages
                }
            });

            ws.on('close', () => {
                wsConnectionCount--;
                clientFilters.delete(ws);
                clientAuth.delete(ws);
            });
        });
        }

        // Make broadcast available to handlers
        global.broadcast = broadcast;

        // Periodic stats broadcast for dashboard
        setInterval(() => {
            if (global.serviceRegistry && global.serviceRegistry.getDashboardStats) {
                const stats = global.serviceRegistry.getDashboardStats();
                broadcast('stats_update', stats);
            }
        }, 5000); // Every 5 seconds
} else {
    // Full mode
    const loggingUtil = require('./src/main/util/logging/logging-util');
    const maxineApiRoutes = require('./src/main/routes/api-routes');
    const { discoveryService } = require('./src/main/service/discovery-service');
    const { healthService } = require('./src/main/service/health-service');
    const { serviceRegistry } = require('./src/main/entity/service-registry');
    global.serviceRegistry = serviceRegistry;
    const path = require("path");
    const fs = require("fs");
    const currDir = require('./conf');

    builder = ExpressAppBuilder.createNewApp()
        .use('/api', maxineApiRoutes)
        .blockUnknownUrls()
        .invoke(() => {});

    if (config.isTestMode) {
        // In test mode, export the app directly without starting server
        module.exports = builder.getApp();
    } else {
        builder.listenOrSpdy(constants.PORT, () => {
            // Server started in full mode

            // MQTT client for event publishing
        let mqttClient = null;
        if (config.mqttEnabled) {
            const mqtt = require('mqtt');
            mqttClient = mqtt.connect(config.mqttBroker);
            mqttClient.on('connect', () => {
                // Connected to MQTT broker
            });
            mqttClient.on('error', (err) => {
                console.error('MQTT connection error:', err);
            });
        }

        // WebSocket server for event streaming
        let wss = null;
        // if (config.websocketEnabled) {
        //     const WebSocket = require('ws');
        //     wss = new WebSocket.Server({ server: builder.server });
        // }

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

        let eventBroadcastCount = 0;

        const matchesFilter = (event, data, filter) => {
            if (!filter) return true;
            if (filter.event && filter.event !== event) return false;
            if (filter.serviceName && data.serviceName && filter.serviceName !== data.serviceName) return false;
            if (filter.nodeId && data.nodeId && filter.nodeId !== data.nodeId) return false;
            // Add more criteria as needed
            return true;
        };

        // if (wss) {
        // const clientFilters = new Map(); // ws -> filter object
        // const clientAuth = new Map(); // ws -> user object or false

        // wss.on('connection', (ws) => {
        //     wsConnectionCount++;
        //     console.log('WebSocket client connected for event streaming');
        //     clientFilters.set(ws, null); // no filter by default
        //     clientAuth.set(ws, config.authEnabled ? false : { role: 'anonymous' }); // user object or false

        //     ws.on('message', (message) => {
        //     try {
        //         const data = JSON.parse(message);
        //         if (data.auth) {
        //             if (config.authEnabled) {
        //                 try {
        //                     const decoded = jwt.verify(data.auth, config.jwtSecret);
        //                     clientAuth.set(ws, decoded);
        //                     ws.send(JSON.stringify({ type: 'authenticated', user: decoded }));
        //                 } catch (err) {
        //                     ws.send(JSON.stringify({ type: 'auth_failed' }));
        //                     ws.close();
        //                 }
        //             }
        //         } else if (!clientAuth.get(ws)) {
        //             ws.send(JSON.stringify({ type: 'auth_required' }));
        //             ws.close();
        //             return;
        //         }
        //         if (data.subscribe) {
        //             // Role check: only admin can subscribe to admin events
        //             const user = clientAuth.get(ws);
        //             if (data.subscribe.event && data.subscribe.event.startsWith('admin_') && (!user || user.role !== 'admin')) {
        //                 ws.send(JSON.stringify({ type: 'error', message: 'Insufficient permissions' }));
        //                 return;
        //             }
        //             clientFilters.set(ws, data.subscribe);
        //             ws.send(JSON.stringify({ type: 'subscribed', filter: data.subscribe }));
        //         }
        //         if (data.unsubscribe) {
        //             clientFilters.set(ws, null);
        //             ws.send(JSON.stringify({ type: 'unsubscribed' }));
        //         }
        //         if (data.refresh_token) {
        //             const user = clientAuth.get(ws);
        //             if (config.authEnabled && user) {
        //                 // Generate new token
        //                 const newToken = jwt.sign({ username: user.username, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
        //                 ws.send(JSON.stringify({ type: 'token_refreshed', token: newToken }));
        //             }
        //         }
        //     } catch (e) {
        //         ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        //     }
        // });

        // ws.on('close', () => {
        //     clientFilters.delete(ws);
        //     clientAuth.delete(ws);
        // });
        // });
        // }
    });

    module.exports = builder.server;
    }
}