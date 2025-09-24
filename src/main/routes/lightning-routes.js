const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const config = require('../config/config');
const discoveryController = require('../controller/maxine/discovery-controller');
const fastJson = require('fast-json-stringify');
const heapdump = require('heapdump');

// Fast JSON schemas for optimized responses
const registerSchema = {
    type: 'object',
    properties: {
        nodeId: { type: 'string' },
        status: { type: 'string' }
    }
};
const stringifyRegister = fastJson(registerSchema);

const heartbeatSchema = {
    type: 'object',
    properties: {
        success: { type: 'boolean' }
    }
};
const stringifyHeartbeat = fastJson(heartbeatSchema);

const deregisterSchema = {
    type: 'object',
    properties: {
        success: { type: 'boolean' }
    }
};
const stringifyDeregister = fastJson(deregisterSchema);

const aliasGetSchema = {
    type: 'object',
    properties: {
        serviceName: { type: 'string' }
    }
};
const stringifyAliasGet = fastJson(aliasGetSchema);

const kvGetSchema = {
    type: 'object',
    properties: {
        value: { type: 'string' }
    }
};
const stringifyKVGet = fastJson(kvGetSchema);

const maintenanceSchema = {
    type: 'object',
    properties: {
        success: { type: 'boolean' }
    }
};
const stringifyMaintenance = fastJson(maintenanceSchema);

const connectionSchema = {
    type: 'object',
    properties: {
        success: { type: 'boolean' }
    }
};
const stringifyConnection = fastJson(connectionSchema);

const responseTimeSchema = {
    type: 'object',
    properties: {
        success: { type: 'boolean' }
    }
};
const stringifyResponseTime = fastJson(responseTimeSchema);

// Pre-allocated buffers for lightning-fast responses
const missingServiceNameBuffer = Buffer.from('{"message": "Missing serviceName"}');
const notFoundBuffer = Buffer.from('{"message": "Service unavailable"}');

// Precompiled regex for UDP/TCP parsing
const commandRegex = /^(\w+)\s+(.+)$/;

// Simple controllers for lightning mode
const getServiceRegistry = () => global.serviceRegistry;

const lightningRegistryController = (req, res) => {
    const { serviceName, host, port, metadata, namespace, datacenter, tags, version, environment } = req.body;
    if (!serviceName || !host || !port) {
        return res.status(400).json({ error: 'Missing serviceName, host, or port' });
    }
    const nodeId = getServiceRegistry().register(serviceName, { host, port, metadata, tags, version, environment }, namespace, datacenter);
    res.json({ nodeId, status: 'registered' });
};

const lightningHeartbeatController = (req, res) => {
    const { nodeId } = req.body;
    if (!nodeId) {
        return res.status(400).json({ error: 'Missing nodeId' });
    }
    const success = getServiceRegistry().heartbeat(nodeId);
    res.send(stringifyHeartbeat({ success }));
};

const lightningDeregisterController = (req, res) => {
    const { serviceName, nodeName, namespace, datacenter } = req.body;
    if (!serviceName || !nodeName) {
        return res.status(400).json({ error: 'Missing serviceName or nodeName' });
    }
    const fullServiceName = datacenter !== "default" ? `${datacenter}:${namespace || "default"}:${serviceName}` : `${namespace || "default"}:${serviceName}`;
    getServiceRegistry().deregister(fullServiceName, nodeName);
    res.send(stringifyDeregister({ success: true }));
};

const lightningServerListController = (req, res) => {
    const services = {};
    for (const [serviceName, service] of getServiceRegistry().services) {
        services[serviceName] = Array.from(service.nodes.values());
    }
    res.json(services);
};

// Rate limiting disabled in lightning mode for maximum speed
// let rateLimit;
// try {
//     rateLimit = require('express-rate-limit');
// } catch (e) {
//     // rateLimit not available
// }
// const limiter = rateLimit ? rateLimit({
//     windowMs: 60000, // 1 minute
//     max: 10000, // limit each IP to 10000 requests per windowMs
//     message: 'Too many requests from this IP, please try again later.',
//     standardHeaders: false,
//     legacyHeaders: false,
// }) : null;

// Basic routes for lightning mode - optimized for speed
// Use raw body parser for minimal overhead
const rawBodyParser = bodyParser.raw({ type: 'application/json', limit: '10kb' });
// Rate limiting disabled for speed
// if (limiter) {
//     router.use(limiter);
// }
router.post('/register', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, lightningRegistryController);
router.post('/heartbeat', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, lightningHeartbeatController);
router.delete('/deregister', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, lightningDeregisterController);
router.get('/discover', (req, res) => {
    const serviceName = req.query.serviceName;
    if (!serviceName) {
        return res.status(400).end(missingServiceNameBuffer);
    }

    const namespace = req.query.namespace || "default";
    const datacenter = req.query.datacenter || "default";
    const fullServiceName = datacenter !== "default" ? `${datacenter}:${namespace}:${serviceName}` : `${namespace}:${serviceName}`;

    const strategy = req.query.strategy || 'round-robin';
    const clientId = req.query.clientId;
    const tags = req.query.tags ? req.query.tags.split(',') : [];
    const version = req.query.version;
    const environment = req.query.environment;
    const serviceNode = getServiceRegistry().getRandomNode(fullServiceName, strategy, clientId, tags, version, environment);
    if (!serviceNode) {
        return res.status(404).end(notFoundBuffer);
    }
    const addr = serviceNode.address;
    const nodeName = serviceNode.nodeName;
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
    res.end(buf);
});
router.get('/discover/weighted', (req, res) => {
    req.query.strategy = 'weighted';
    discoveryController(req, res);
});
router.get('/discover/least-connections', (req, res) => {
    req.query.strategy = 'least-connections';
    discoveryController(req, res);
});
router.get('/discover/lrt', (req, res) => {
    req.query.strategy = 'lrt';
    discoveryController(req, res);
});
router.get('/discover/hash', (req, res) => {
    req.query.strategy = 'hash';
    discoveryController(req, res);
});
router.get('/discover/canary', (req, res) => {
    req.query.strategy = 'canary';
    discoveryController(req, res);
});
router.get('/discover/blue-green', (req, res) => {
    req.query.strategy = 'blue-green';
    discoveryController(req, res);
});
router.post('/connection/increment', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { serviceName, nodeName } = req.body;
    if (!serviceName || !nodeName) {
        return res.status(400).json({ error: 'Missing serviceName or nodeName' });
    }
    getServiceRegistry().incrementActiveConnections(serviceName, nodeName);
    res.send(stringifyConnection({ success: true }));
});
router.post('/connection/decrement', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { serviceName, nodeName } = req.body;
    if (!serviceName || !nodeName) {
        return res.status(400).json({ error: 'Missing serviceName or nodeName' });
    }
    getServiceRegistry().decrementActiveConnections(serviceName, nodeName);
    res.send(stringifyConnection({ success: true }));
});
router.post('/response-time', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { serviceName, nodeName, latency } = req.body;
    if (!serviceName || !nodeName || latency === undefined) {
        return res.status(400).json({ error: 'Missing serviceName, nodeName, or latency' });
    }
    getServiceRegistry().recordResponseTime(serviceName, nodeName, latency);
    res.send(stringifyResponseTime({ success: true }));
});

router.post('/record-call', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { callerService, calledService } = req.body;
    if (!callerService || !calledService) {
        return res.status(400).json({ error: 'Missing callerService or calledService' });
    }
    getServiceRegistry().recordCall(callerService, calledService);
    res.send(stringifyResponseTime({ success: true })); // reuse schema
});
router.get('/servers', lightningServerListController);
router.get('/health', (req, res) => {
    const services = getServiceRegistry().services.size;
    const totalNodes = Array.from(getServiceRegistry().services.values()).reduce((sum, s) => sum + s.healthyNodes.size, 0);
    const totalActiveConnections = Array.from(getServiceRegistry().activeConnections.values()).reduce((sum, c) => sum + c, 0);
    const responseTimes = Array.from(getServiceRegistry().responseTimes.values());
    const averageResponseTime = responseTimes.length > 0 ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length : 0;
    res.end(`{"status":"ok","services":${services},"nodes":${totalNodes},"activeConnections":${totalActiveConnections},"averageResponseTime":${averageResponseTime.toFixed(2)}}`);
});

router.get('/health/score', (req, res) => {
    const { serviceName } = req.query;
    if (!serviceName) {
        return res.status(400).end('{"message":"Missing serviceName"}');
    }
    const score = getServiceRegistry().getServiceHealthScore(serviceName);
    res.end(`{"serviceName":"${serviceName}","healthScore":${score.toFixed(2)}}`);
});

router.get('/backup', (req, res) => {
    const data = getServiceRegistry().backup();
    res.json(data);
});

router.post('/restore', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const success = getServiceRegistry().restore(req.body);
    res.send(stringifyDeregister({ success }));
});

// Basic metrics for lightning mode
    if (config.metricsEnabled) {
    let requestCount = 0;
    let errorCount = 0;
    let startTime = Date.now();

    router.get('/metrics', (req, res) => {
        const uptime = Date.now() - startTime;
        const services = getServiceRegistry().services.size;
        const totalNodes = Array.from(getServiceRegistry().services.values()).reduce((sum, s) => sum + s.healthyNodes.size, 0);
        const totalActiveConnections = Array.from(getServiceRegistry().activeConnections.values()).reduce((sum, c) => sum + c, 0);
        const responseTimes = Array.from(getServiceRegistry().responseTimes.values());
        const averageResponseTime = responseTimes.length > 0 ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length : 0;
        res.end(`{"uptime":${uptime},"requests":${requestCount},"errors":${errorCount},"services":${services},"nodes":${totalNodes},"activeConnections":${totalActiveConnections},"averageResponseTime":${averageResponseTime.toFixed(2)}}`);
    });

    router.get('/predict-health', (req, res) => {
        const serviceName = req.query.serviceName;
        const window = parseInt(req.query.window) || 300000; // 5 minutes default

        if (!serviceName) {
            return res.status(400).json({ error: "Missing serviceName parameter" });
        }

        const prediction = getServiceRegistry().predictHealth(serviceName, window);
        res.json(prediction);
    });

    // Middleware to count requests
    router.use((req, res, next) => {
        requestCount++;
        const originalEnd = res.end;
        res.end = function(...args) {
            if (res.statusCode >= 400) {
                errorCount++;
            }
            originalEnd.apply(this, args);
        };
        next();
    });

    // Heap dump for memory profiling
    router.get('/heapdump', (req, res) => {
        const filename = `heapdump-${Date.now()}.heapsnapshot`;
        heapdump.writeSnapshot(filename, (err, filename) => {
            if (err) {
                res.status(500).send('Error creating heap dump');
            } else {
                res.send(`Heap dump written to ${filename}`);
            }
        });
    });
}

// Middleware to count requests
router.use((req, res, next) => {
    requestCount++;
    const originalEnd = res.end;
    res.end = function(...args) {
        if (res.statusCode >= 400) {
            errorCount++;
        }
        originalEnd.apply(this, args);
    };
    next();
});

// Optional canary and blue-green for full mode features
// Enable canary and blue-green in lightning mode
router.post('/api/maxine/serviceops/canary/set', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    const { serviceName, percentage, canaryNodes } = req.body;
    if (!serviceName || percentage === undefined || !Array.isArray(canaryNodes)) {
        return res.status(400).end('{"message":"Invalid parameters"}');
    }
    getServiceRegistry().setCanary(serviceName, percentage, canaryNodes);
    res.end('{"message":"Canary set"}');
});
router.post('/api/maxine/serviceops/blue-green/set', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    const { serviceName, blueNodes, greenNodes, activeColor } = req.body;
    if (!serviceName || !Array.isArray(blueNodes) || !Array.isArray(greenNodes)) {
        return res.status(400).end('{"message":"Invalid parameters"}');
    }
    getServiceRegistry().setBlueGreen(serviceName, blueNodes, greenNodes, activeColor || 'blue');
    res.end('{"message":"Blue-green set"}');
});

router.post('/alias/set', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { alias, serviceName } = req.body;
    if (!alias || !serviceName) {
        return res.status(400).json({ error: 'Missing alias or serviceName' });
    }
    getServiceRegistry().setAlias(alias, serviceName);
    res.send(stringifyDeregister({ success: true })); // reuse schema
});

router.get('/alias/get', (req, res) => {
    const { alias } = req.query;
    if (!alias) {
        return res.status(400).json({ error: 'Missing alias' });
    }
    const serviceName = getServiceRegistry().getAlias(alias);
    res.send(stringifyAliasGet({ serviceName }));
});

router.post('/maintenance/set', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { nodeName, inMaintenance } = req.body;
    if (!nodeName) {
        return res.status(400).json({ error: 'Missing nodeName' });
    }
    getServiceRegistry().setMaintenance(nodeName, inMaintenance);
    res.send(stringifyMaintenance({ success: true }));
});

router.post('/kv/set', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { key, value } = req.body;
    if (!key) {
        return res.status(400).json({ error: 'Missing key' });
    }
    getServiceRegistry().setKV(key, value);
    res.send(stringifyDeregister({ success: true })); // reuse
});

router.get('/kv/get', (req, res) => {
    const { key } = req.query;
    if (!key) {
        return res.status(400).json({ error: 'Missing key' });
    }
    const value = getServiceRegistry().getKV(key);
    res.send(stringifyKVGet({ value }));
});

// Federation routes
router.post('/federation/add', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { name, url } = req.body;
    if (!name || !url) {
        return res.status(400).json({ error: 'Missing name or url' });
    }
    getServiceRegistry().addFederatedRegistry(name, url);
    res.send(stringifyDeregister({ success: true }));
});

router.delete('/federation/remove', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Missing name' });
    }
    getServiceRegistry().removeFederatedRegistry(name);
    res.send(stringifyDeregister({ success: true }));
});

router.get('/federation/status', (req, res) => {
    const federationService = require('../service/federation-service');
    const status = federationService.getFailoverStatus();
    res.json(status);
});

router.get('/service-mesh/metrics', (req, res) => {
    const { serviceMeshMetricsController } = require('../controller/maxine/envoy-controller');
    serviceMeshMetricsController(req, res);
});

router.get('/anomalies', (req, res) => {
    const anomalies = getServiceRegistry().getAnomalies();
    res.json({ anomalies });
});

// Distributed tracing endpoints
const traces = new Map(); // In-memory trace storage

router.post('/trace/start', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { id, operation } = req.body;
    if (!id || !operation) {
        return res.status(400).json({ error: 'Missing id or operation' });
    }
    traces.set(id, {
        id,
        operation,
        startTime: Date.now(),
        events: [],
        status: 'active'
    });
    res.json({ success: true });
});

router.post('/trace/event', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { id, event } = req.body;
    if (!id || !event) {
        return res.status(400).json({ error: 'Missing id or event' });
    }
    const trace = traces.get(id);
    if (!trace) {
        return res.status(404).json({ error: 'Trace not found' });
    }
    trace.events.push({
        event,
        timestamp: Date.now()
    });
    res.json({ success: true });
});

router.post('/trace/end', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { id } = req.body;
    if (!id) {
        return res.status(400).json({ error: 'Missing id' });
    }
    const trace = traces.get(id);
    if (!trace) {
        return res.status(404).json({ error: 'Trace not found' });
    }
    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.status = 'completed';
    res.json({ success: true });
});

router.get('/trace/:id', (req, res) => {
    const { id } = req.params;
    const trace = traces.get(id);
    if (!trace) {
        return res.status(404).json({ error: 'Trace not found' });
    }
    res.json(trace);
});

router.get('/federated/discover', (req, res) => {
    const serviceName = req.query.serviceName;
    if (!serviceName) {
        return res.status(400).end(missingServiceNameBuffer);
    }
    const strategy = req.query.strategy || 'round-robin';
    const clientId = req.query.clientId;
    const node = getServiceRegistry().getFederatedNode(serviceName, strategy, clientId);
    if (!node) {
        return res.status(404).end(notFoundBuffer);
    }
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
    res.end(buf);
});

// Dependency routes
router.post('/dependency/add', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { serviceName, dependsOn } = req.body;
    if (!serviceName || !dependsOn) {
        return res.status(400).json({ error: 'Missing serviceName or dependsOn' });
    }
    getServiceRegistry().addDependency(serviceName, dependsOn);
    res.send(stringifyDeregister({ success: true }));
});

router.get('/dependency/get', (req, res) => {
    const { serviceName } = req.query;
    if (!serviceName) {
        return res.status(400).json({ error: 'Missing serviceName' });
    }
    const deps = Array.from(getServiceRegistry().getDependencies(serviceName));
    res.json({ dependencies: deps });
});

router.get('/dependency/dependents', (req, res) => {
    const { serviceName } = req.query;
    if (!serviceName) {
        return res.status(400).json({ error: 'Missing serviceName' });
    }
    const deps = Array.from(getServiceRegistry().getDependents(serviceName));
    res.json({ dependents: deps });
});

// Tracing routes
router.post('/trace/start', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { operation, id } = req.body;
    if (!operation || !id) {
        return res.status(400).json({ error: 'Missing operation or id' });
    }
    getServiceRegistry().startTrace(operation, id);
    res.send(stringifyDeregister({ success: true }));
});

router.post('/trace/event', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { id, event } = req.body;
    if (!id || !event) {
        return res.status(400).json({ error: 'Missing id or event' });
    }
    getServiceRegistry().addTraceEvent(id, event);
    res.send(stringifyDeregister({ success: true }));
});

router.post('/trace/end', rawBodyParser, (req, res, next) => {
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (e) {
        return res.status(400).end('{"message":"Invalid JSON"}');
    }
    next();
}, (req, res) => {
    const { id } = req.body;
    if (!id) {
        return res.status(400).json({ error: 'Missing id' });
    }
    getServiceRegistry().endTrace(id);
    res.send(stringifyDeregister({ success: true }));
});

router.get('/trace/get', (req, res) => {
    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: 'Missing id' });
    }
    const trace = getServiceRegistry().getTrace(id);
    res.json(trace || {});
});

module.exports = { router };