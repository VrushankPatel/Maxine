const { info } = require('../../util/logging/logging-util');
const { statusAndMsgs } = require('../../util/constants/constants');
const { registryService } = require('../../service/registry-service');
const { serviceRegistry } = require('../../entity/service-registry');
const { metricsService } = require('../../service/metrics-service');
const { discoveryService } = require('../../service/discovery-service');
const axios = require('axios');
const _ = require('lodash');
const httpProxy = require('http-proxy');
const http = require('http');
const https = require('https');
const proxy = httpProxy.createProxyServer({
    agent: new http.Agent({ keepAlive: true, maxSockets: 500, maxFreeSockets: 256, timeout: 60000 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 500, maxFreeSockets: 256, timeout: 60000 })
});

proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err);
    if (!res.headersSent) {
        res.status(502).json({ message: 'Bad Gateway' });
    }
});

const registryController = (req, res) => {
    const serviceResponse = registryService.registryService(req.body);
    if(!serviceResponse){
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_INVALID_SERVICE_DATA});
    }
    info(serviceResponse);
    res.status(statusAndMsgs.STATUS_SUCCESS).json(serviceResponse);
}


const serverListController = (_req, res) => {
    res.type('application/json');
    res.send(JSON.stringify(serviceRegistry.getRegServers()));
}

const deregisterController = (req, res) => {
    const { serviceName, nodeName, namespace } = req.body;
    if (!serviceName || !nodeName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName or nodeName" });
        return;
    }
    const success = registryService.deregisterService(serviceName, nodeName, namespace);
    if (success) {
        res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Deregistered successfully" });
    } else {
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({ message: "Service not found" });
    }
}

const healthController = async (req, res) => {
    const serviceName = req.query.serviceName;
    const namespace = req.query.namespace || "default";
    if (!serviceName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName" });
        return;
    }
    const fullServiceName = `${namespace}:${serviceName}`;
    const nodes = serviceRegistry.getNodes(fullServiceName);
    if (!nodes || Object.keys(nodes).length === 0) {
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({ message: "Service not found" });
        return;
    }
    const healthPromises = Object.entries(nodes).map(async ([nodeName, node]) => {
        try {
            const healthUrl = node.address + (node.metadata.healthEndpoint || '');
            const response = await axios.get(healthUrl, { timeout: 5000 });
            // Update registry with healthy status
            if (serviceRegistry.registry[fullServiceName] && serviceRegistry.registry[fullServiceName].nodes[nodeName]) {
                const nodeObj = serviceRegistry.registry[fullServiceName].nodes[nodeName];
                nodeObj.healthy = true;
                nodeObj.failureCount = 0;
                nodeObj.lastFailureTime = null;
                serviceRegistry.addToHealthyNodes(fullServiceName, nodeName);
                serviceRegistry.debounceSave();
            }
            return [nodeName, { status: 'healthy', code: response.status }];
        } catch (error) {
            // Update registry with unhealthy status
            if (serviceRegistry.registry[fullServiceName] && serviceRegistry.registry[fullServiceName].nodes[nodeName]) {
                const nodeObj = serviceRegistry.registry[fullServiceName].nodes[nodeName];
                nodeObj.healthy = false;
                nodeObj.failureCount = (nodeObj.failureCount || 0) + 1;
                nodeObj.lastFailureTime = Date.now();
                serviceRegistry.removeFromHealthyNodes(fullServiceName, nodeName);
                serviceRegistry.debounceSave();
            }
            return [nodeName, { status: 'unhealthy', error: error.message }];
        }
    });
    const healthResultsArray = await Promise.all(healthPromises);
    const healthResults = Object.fromEntries(healthResultsArray);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ serviceName, namespace, health: healthResults });
}

const filteredDiscoveryController = (req, res) => {
    const startTime = Date.now();
    const serviceName = req.query.serviceName;
    const namespace = req.query.namespace || "default";
    const tags = req.query.tags ? req.query.tags.split(',') : [];
    const endPoint = req.query.endPoint || "";
    const ip = req.ip
    || req.connection.remoteAddress
    || req.socket.remoteAddress
    || req.connection.socket.remoteAddress;

    if(!serviceName) {
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, false, latency);
        metricsService.recordError('missing_service_name');
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_DISCOVER_MISSING_DATA});
        return;
    }

    const fullServiceName = `${namespace}:${serviceName}`;
    const nodes = serviceRegistry.getNodes(fullServiceName);
    const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName);
    if (healthyNodeNames.length === 0) {
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, false, latency);
        metricsService.recordError('service_unavailable');
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
            "message" : statusAndMsgs.MSG_SERVICE_UNAVAILABLE
        });
        return;
    }

    // Filter by tags
    let filteredNodes = healthyNodeNames;
    if (tags && tags.length > 0) {
        const taggedSets = tags.map(tag => serviceRegistry.tagIndex.get(tag) || new Set());
        const taggedNodes = _.intersection(...taggedSets.map(s => Array.from(s)));
        filteredNodes = healthyNodeNames.filter(nodeName => taggedNodes.includes(nodeName));
    }

    if (filteredNodes.length === 0) {
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, false, latency);
        metricsService.recordError('no_matching_nodes');
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
            "message" : "No nodes match the specified tags"
        });
        return;
    }

    // Simple round-robin for filtered
    const offset = (serviceRegistry.registry[fullServiceName] || {}).filteredOffset || 0;
    serviceRegistry.registry[fullServiceName].filteredOffset = (offset + 1) % filteredNodes.length;
    const selectedNodeName = filteredNodes[offset];
    const serviceNode = nodes[selectedNodeName];

    const addressToRedirect = serviceNode.address + (endPoint.length > 0 ? (endPoint[0] == "/" ? endPoint : `/${endPoint}`) : "");
    info(`Filtered proxying to ${addressToRedirect}`);

    // Increment active connections
    serviceRegistry.incrementActiveConnections(fullServiceName, serviceNode.nodeName);

    try {
        proxy.web(req, res, { target: addressToRedirect, changeOrigin: true });
    } catch (err) {
        console.error('Proxy setup error:', err);
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, false, latency);
        metricsService.recordError('proxy_error');
        serviceRegistry.decrementActiveConnections(fullServiceName, serviceNode.nodeName);
        res.status(500).json({ message: 'Proxy Error' });
        return;
    }

    res.on('finish', () => {
        const latency = Date.now() - startTime;
        const success = res.statusCode >= 200 && res.statusCode < 300;
        metricsService.recordRequest(serviceName, success, latency);
        serviceRegistry.decrementActiveConnections(fullServiceName, serviceNode.nodeName);
    });
    res.on('close', () => {
        serviceRegistry.decrementActiveConnections(fullServiceName, serviceNode.nodeName);
    });
}

const metricsController = (req, res) => {
    res.status(statusAndMsgs.STATUS_SUCCESS).json(metricsService.getMetrics());
}

const prometheusMetricsController = (req, res) => {
    const metrics = metricsService.getMetrics();
    let prometheusOutput = '';

    // Request counts
    for (const [service, count] of Object.entries(metrics.requestCounts || {})) {
        prometheusOutput += `# HELP maxine_requests_total Total number of requests for service\n`;
        prometheusOutput += `# TYPE maxine_requests_total counter\n`;
        prometheusOutput += `maxine_requests_total{service="${service}"} ${count}\n`;
    }

    // Error counts
    for (const [error, count] of Object.entries(metrics.errorCounts || {})) {
        prometheusOutput += `# HELP maxine_errors_total Total number of errors\n`;
        prometheusOutput += `# TYPE maxine_errors_total counter\n`;
        prometheusOutput += `maxine_errors_total{error="${error}"} ${count}\n`;
    }

    // Latencies
    for (const [service, latency] of Object.entries(metrics.averageLatencies || {})) {
        prometheusOutput += `# HELP maxine_request_duration_seconds Average request duration in seconds\n`;
        prometheusOutput += `# TYPE maxine_request_duration_seconds gauge\n`;
        prometheusOutput += `maxine_request_duration_seconds{service="${service}"} ${latency / 1000}\n`;
    }

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(prometheusOutput);
}

const discoveryInfoController = (req, res) => {
    const startTime = Date.now();
    const serviceName = req.query.serviceName;
    const version = req.query.version;
    const namespace = req.query.namespace || "default";
    const ip = req.ip
    || req.connection.remoteAddress
    || req.socket.remoteAddress
    || req.connection.socket.remoteAddress;

    if(!serviceName) {
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, false, latency);
        metricsService.recordError('missing_service_name');
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_DISCOVER_MISSING_DATA});
        return;
    }

    const serviceNode = discoveryService.getNode(serviceName, ip, version, namespace);

    if(_.isEmpty(serviceNode)){
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, false, latency);
        metricsService.recordError('service_unavailable');
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
            "message" : statusAndMsgs.MSG_SERVICE_UNAVAILABLE
        });
        return;
    }

    const latency = Date.now() - startTime;
    metricsService.recordRequest(serviceName, true, latency);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({
        serviceName,
        namespace,
        node: {
            nodeName: serviceNode.nodeName,
            address: serviceNode.address,
            metadata: serviceNode.metadata
        }
    });
}

const changesController = (req, res) => {
    const since = parseInt(req.query.since) || 0;
    const changes = serviceRegistry.getChangesSince(since);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ changes });
}

const bulkRegisterController = (req, res) => {
    const services = req.body;
    if (!Array.isArray(services)) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Body must be an array of services" });
        return;
    }
    const results = services.map(service => {
        try {
            const serviceResponse = registryService.registryService(service);
            return serviceResponse ? { success: true, service: serviceResponse } : { success: false, error: "Invalid service data" };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ results });
}

const bulkDeregisterController = (req, res) => {
    const services = req.body;
    if (!Array.isArray(services)) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Body must be an array of {serviceName, nodeName, namespace}" });
        return;
    }
    const results = services.map(({ serviceName, nodeName, namespace }) => {
        if (!serviceName || !nodeName) {
            return { success: false, error: "Missing serviceName or nodeName" };
        }
        const success = registryService.deregisterService(serviceName, nodeName, namespace);
        return success ? { success: true } : { success: false, error: "Service not found" };
    });
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ results });
}

module.exports = {
    registryController,
    serverListController,
    deregisterController,
    healthController,
    metricsController,
    prometheusMetricsController,
    filteredDiscoveryController,
    discoveryInfoController,
    changesController,
    bulkRegisterController,
    bulkDeregisterController
};