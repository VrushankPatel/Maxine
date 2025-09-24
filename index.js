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
    const jwt = require('jsonwebtoken');
    const bcrypt = require('bcrypt');
    const httpProxy = require('http-proxy');
    const proxy = httpProxy.createProxyServer({});
    const WebSocket = require('ws');
    const mqtt = require('mqtt');

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
    const handleRegister = (req, res, query, body) => {
        const { serviceName, host, port, metadata } = body;
        if (!serviceName || !host || !port) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(errorMissingServiceName);
            return;
        }
        const nodeId = serviceRegistry.register(serviceName, { host, port, metadata });
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
        const version = query.version;
        const fullServiceName = version ? `${serviceName}:${version}` : serviceName;
        const strategy = query.loadBalancing || 'round-robin';
        const clientIP = req.connection.remoteAddress;
        const node = serviceRegistry.getRandomNode(fullServiceName, strategy, clientIP);
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
    routes.set('POST /signin', (req, res, query, body) => {
        const { username, password } = body;
        if (!username || !password) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end('{"error": "Missing username or password"}');
            return;
        }
        if (username === config.adminUsername && bcrypt.compareSync(password, config.adminPasswordHash)) {
            const token = jwt.sign({ username, role: 'admin' }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ token }));
        } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(errorUnauthorized);
        }
    });

    // Persistence endpoints
    routes.set('GET /backup', (req, res, query, body) => {
        if (config.authEnabled) {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
            const token = authHeader.substring(7);
            try {
                jwt.verify(token, config.jwtSecret);
            } catch (err) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
        }
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
        if (config.authEnabled) {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
            const token = authHeader.substring(7);
            try {
                jwt.verify(token, config.jwtSecret);
            } catch (err) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
        }
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

    // Basic tracing endpoints
    routes.set('POST /trace/start', (req, res, query, body) => {
        if (config.authEnabled) {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
            const token = authHeader.substring(7);
            try {
                jwt.verify(token, config.jwtSecret);
            } catch (err) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
        }
        const { operation, id } = body;
        if (!id || !operation) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end('{"error": "Missing id or operation"}');
            return;
        }
        serviceRegistry.startTrace(id, operation);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"success": true}');
    });

    routes.set('POST /trace/event', (req, res, query, body) => {
        if (config.authEnabled) {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
            const token = authHeader.substring(7);
            try {
                jwt.verify(token, config.jwtSecret);
            } catch (err) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
        }
        const { id, event } = body;
        if (!id || !event) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end('{"error": "Missing id or event"}');
            return;
        }
        serviceRegistry.addTraceEvent(id, event);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"success": true}');
    });

    routes.set('POST /trace/end', (req, res, query, body) => {
        if (config.authEnabled) {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
            const token = authHeader.substring(7);
            try {
                jwt.verify(token, config.jwtSecret);
            } catch (err) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
        }
        const { id } = body;
        if (!id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end('{"error": "Missing id"}');
            return;
        }
        serviceRegistry.endTrace(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"success": true}');
    });

    routes.set('GET /trace/:id', (req, res, query, body) => {
        if (config.authEnabled) {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
            const token = authHeader.substring(7);
            try {
                jwt.verify(token, config.jwtSecret);
            } catch (err) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(errorUnauthorized);
                return;
            }
        }
        const id = req.url.split('/').pop();
        const trace = serviceRegistry.getTrace(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(trace));
    });

    // Service Mesh Integration
    const handleEnvoyConfig = (req, res, query, body) => {
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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(envoyConfig, null, 2));
    };

    const handleIstioConfig = (req, res, query, body) => {
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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(configs, null, 2));
    };

    routes.set('GET /service-mesh/envoy-config', handleEnvoyConfig);
    routes.set('GET /service-mesh/istio-config', handleIstioConfig);

    // Circuit Breaker endpoints
    routes.set('GET /circuit-breaker/:nodeId', (req, res, query, body) => {
        const nodeId = req.url.split('/').pop();
        const state = serviceRegistry.getCircuitState(nodeId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state));
    });

    // Event history endpoints
    routes.set('GET /events', (req, res, query, body) => {
        const since = query.since ? parseInt(query.since) : 0;
        const limit = query.limit ? parseInt(query.limit) : 100;
        const filtered = eventHistory.filter(e => e.timestamp > since).slice(-limit);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(filtered));
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

         const parsedUrl = new URL(req.url, `http://localhost`);
         const pathname = parsedUrl.pathname;
         const query = Object.fromEntries(parsedUrl.searchParams);
         const method = req.method;

        // Handle proxy routes
        if (pathname.startsWith('/proxy/')) {
            const parts = pathname.split('/');
            if (parts.length < 3) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end('{"error": "Invalid proxy path"}');
                return;
            }
            const serviceName = parts[2];
            const path = '/' + parts.slice(3).join('/');
            const node = serviceRegistry.getRandomNode(serviceName);
            if (!node) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(serviceUnavailable);
                return;
            }
            const target = `http://${node.address}`;
             req.url = path + parsedUrl.search;
             proxy.web(req, res, { target }, (err) => {
                 if (err) {
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

        // WebSocket server for real-time event streaming
        const wss = new WebSocket.Server({ server });

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

        const broadcast = (event, data) => {
            const messageObj = { event, data, timestamp: Date.now() };
            const message = JSON.stringify(messageObj);
            // Store in history
            eventHistory.push(messageObj);
            if (eventHistory.length > maxHistory) {
                eventHistory.shift();
            }
            // WebSocket broadcast with filtering
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    const filter = clientFilters.get(client);
                    if (!filter || matchesFilter(event, data, filter)) {
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

        const matchesFilter = (event, data, filter) => {
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