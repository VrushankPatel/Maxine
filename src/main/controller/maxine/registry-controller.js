const { info, audit, consoleError } = require('../../util/logging/logging-util');
const { statusAndMsgs } = require('../../util/constants/constants');
const { registryService } = require('../../service/registry-service');
const { serviceRegistry } = require('../../entity/service-registry');
const { metricsService } = require('../../service/metrics-service');
const { discoveryService } = require('../../service/discovery-service');
const { buildFullServiceName } = require("../../util/util");
const config = require('../../config/config');

const statsController = (req, res) => {
    const services = serviceRegistry.getRegServers();
    const stats = {
        totalServices: Object.keys(services).length,
        totalNodes: 0,
        healthyNodes: 0,
        unhealthyNodes: 0,
        services: {}
    };
    for (const [serviceName, service] of Object.entries(services)) {
        const nodes = service.nodes;
        const nodeCount = Object.keys(nodes).length;
        stats.totalNodes += nodeCount;
        let healthy = 0;
        let unhealthy = 0;
        for (const node of Object.values(nodes)) {
            if (node.healthy) healthy++;
            else unhealthy++;
        }
        stats.healthyNodes += healthy;
        stats.unhealthyNodes += unhealthy;
        const uptime = serviceRegistry.getServiceUptime(serviceName);
        stats.services[serviceName] = {
            totalNodes: nodeCount,
            healthyNodes: healthy,
            unhealthyNodes: unhealthy,
            uptime: uptime
        };
    }
    res.json(stats);
};

const slaController = (req, res) => {
    const serviceName = req.query.serviceName;
    const nodeName = req.query.nodeName;
    const services = serviceRegistry.getRegServers();
    const slaData = {};

    if (serviceName && nodeName) {
        // Specific node SLA
        const history = serviceRegistry.getHealthHistory(serviceName, nodeName);
        const totalChecks = history.length;
        const healthyChecks = history.filter(h => h.status).length;
        const uptime = totalChecks > 0 ? (healthyChecks / totalChecks) * 100 : 0;
        const avgResponseTime = serviceRegistry.getAverageResponseTime(serviceName, nodeName);
        slaData[serviceName] = {
            [nodeName]: {
                uptime: uptime.toFixed(2) + '%',
                averageResponseTime: avgResponseTime.toFixed(2) + 'ms',
                totalChecks,
                healthyChecks
            }
        };
    } else if (serviceName) {
        // Service SLA
        const service = services[serviceName];
        if (service) {
            slaData[serviceName] = {};
            for (const [nName, node] of Object.entries(service.nodes)) {
                const history = serviceRegistry.getHealthHistory(serviceName, nName);
                const totalChecks = history.length;
                const healthyChecks = history.filter(h => h.status).length;
                const uptime = totalChecks > 0 ? (healthyChecks / totalChecks) * 100 : 0;
                const avgResponseTime = serviceRegistry.getAverageResponseTime(serviceName, nName);
                slaData[serviceName][nName] = {
                    uptime: uptime.toFixed(2) + '%',
                    averageResponseTime: avgResponseTime.toFixed(2) + 'ms',
                    totalChecks,
                    healthyChecks
                };
            }
        }
    } else {
        // All services SLA
        for (const [sName, service] of Object.entries(services)) {
            slaData[sName] = {};
            for (const [nName, node] of Object.entries(service.nodes)) {
                const history = serviceRegistry.getHealthHistory(sName, nName);
                const totalChecks = history.length;
                const healthyChecks = history.filter(h => h.status).length;
                const uptime = totalChecks > 0 ? (healthyChecks / totalChecks) * 100 : 0;
                const avgResponseTime = serviceRegistry.getAverageResponseTime(sName, nName);
                slaData[sName][nName] = {
                    uptime: uptime.toFixed(2) + '%',
                    averageResponseTime: avgResponseTime.toFixed(2) + 'ms',
                    totalChecks,
                    healthyChecks
                };
            }
        }
    }
    res.json(slaData);
};

const healthScoreController = (req, res) => {
    const serviceName = req.query.serviceName;
    const nodeName = req.query.nodeName;
    const services = serviceRegistry.getRegServers();
    const healthScores = {};

    if (serviceName && nodeName) {
        // Specific node health score
        const score = serviceRegistry.getHealthScore(serviceName, nodeName);
        healthScores[serviceName] = {
            [nodeName]: score
        };
    } else if (serviceName) {
        // Service health scores
        const service = services[serviceName];
        if (service) {
            healthScores[serviceName] = {};
            for (const nName of Object.keys(service.nodes)) {
                healthScores[serviceName][nName] = serviceRegistry.getHealthScore(serviceName, nName);
            }
        }
    } else {
        // All services health scores
        for (const [sName, service] of Object.entries(services)) {
            healthScores[sName] = {};
            for (const nName of Object.keys(service.nodes)) {
                healthScores[sName][nName] = serviceRegistry.getHealthScore(sName, nName);
            }
        }
    }
    res.json(healthScores);
};

const autoscalingController = (req, res) => {
    const { serviceName, action, reason } = req.body;
    // Trigger auto-scaling action, e.g., call webhook or internal logic
    const webhooks = serviceRegistry.getWebhooks(serviceName);
    webhooks.forEach(url => {
        const axios = require('axios');
        axios.post(url, { serviceName, action, reason, timestamp: new Date().toISOString() }).catch(err => {
            consoleError('Autoscaling webhook failed:', err.message);
        });
    });
    res.json({ message: 'Autoscaling triggered', serviceName, action });
};

const chaosController = (req, res) => {
    const { serviceName, nodeName, action } = req.body;
    // Simulate chaos: mark unhealthy, delay, etc.
    if (action === 'fail') {
        const service = serviceRegistry.registry.get(serviceName);
        if (service && service.nodes[nodeName]) {
            service.nodes[nodeName].healthy = false;
            serviceRegistry.removeFromHealthyNodes(serviceName, nodeName);
            serviceRegistry.addChange('unhealthy', serviceName, nodeName, { simulated: true });
        }
    } else if (action === 'recover') {
        const service = serviceRegistry.registry.get(serviceName);
        if (service && service.nodes[nodeName]) {
            service.nodes[nodeName].healthy = true;
            serviceRegistry.addToHealthyNodes(serviceName, nodeName);
            serviceRegistry.addChange('healthy', serviceName, nodeName, { simulated: true });
        }
    }
    res.json({ message: 'Chaos action applied', serviceName, nodeName, action });
};

const httpProxy = require('http-proxy');
const http = require('http');
const https = require('https');
const pLimit = require('p-limit');
const proxy = httpProxy.createProxyServer({
    agent: new http.Agent({
        keepAlive: true,
        maxSockets: 10000,
        maxFreeSockets: 5000,
        timeout: 60000,
        keepAliveMsecs: 300000
    }),
    httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets: 10000,
        maxFreeSockets: 5000,
        timeout: 60000,
        keepAliveMsecs: 300000
    }),
    proxyTimeout: 60000,
    timeout: 60000
});

proxy.on('error', (err, req, res) => {
    consoleError('Proxy error:', err);
    if (!res.headersSent) {
        res.status(502).json({ message: 'Bad Gateway' });
    }
});

const registryController = (req, res) => {
    const { serviceName, namespace = "default", leaseTime } = req.body;
    const fullServiceName = `${namespace}:${serviceName}`;
    const existingNodes = serviceRegistry.getNodes(fullServiceName);
    const nodeCount = existingNodes ? Object.keys(existingNodes).length : 0;
    if (nodeCount >= config.maxInstancesPerService) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : `Maximum instances per service (${config.maxInstancesPerService}) exceeded`});
        return;
    }
    const serviceResponse = registryService.registerService(req.body);
    if(!serviceResponse){
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_INVALID_SERVICE_DATA});
        return;
    }
    // Set lease if provided
    if (leaseTime) {
        serviceRegistry.setLease(fullServiceName, serviceResponse.nodeName, leaseTime);
    }
    audit(`REGISTER: service ${serviceResponse.serviceName} node ${serviceResponse.nodeName} at ${serviceResponse.address}`);
    res.status(statusAndMsgs.STATUS_SUCCESS).json(serviceResponse);
}


const serverListController = (_req, res) => {
    res.type('application/json');
    res.send(JSON.stringify(serviceRegistry.getRegServers()));
}

const renewLeaseController = (req, res) => {
    const { serviceName, nodeName, namespace = "default" } = req.body;
    if (!serviceName || !nodeName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName or nodeName" });
        return;
    }
    const fullServiceName = `${namespace}:${serviceName}`;
    serviceRegistry.renewLease(fullServiceName, nodeName);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Lease renewed" });
}

const heartbeatController = (req, res) => {
    const { serviceName, nodeName, namespace = "default", version } = req.body;
    if (!serviceName || !nodeName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName or nodeName" });
        return;
    }
    const datacenter = req.body.datacenter || "default";
    const fullServiceName = buildFullServiceName(serviceName, namespace, datacenter, version);
    const service = serviceRegistry.registry.get(fullServiceName);
    if (!service) {
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({ message: "Service not found" });
        return;
    }
    // Find all nodes with this nodeName or parentNode
    let nodesToRenew;
    if (config.lightningMode) {
        nodesToRenew = Array.from(service.nodes.values()).filter(n => n.nodeName === nodeName || n.parentNode === nodeName).map(n => n.nodeName);
    } else {
        nodesToRenew = Object.keys(service.nodes).filter(n => service.nodes[n].nodeName === nodeName || service.nodes[n].parentNode === nodeName);
    }
    if (nodesToRenew.length === 0) {
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({ message: "Node not found" });
        return;
    }
    for (const n of nodesToRenew) {
        if (config.lightningMode) {
            // Lightning mode: just update timestamp
            serviceRegistry.lastHeartbeats.set(n, Date.now());
            serviceRegistry.nodeToService.set(n, fullServiceName);
        } else {
            const timeResetter = serviceRegistry.timeResetters.get(n);
            if (timeResetter) {
                clearTimeout(timeResetter);
            }
            let node;
            node = service.nodes[n];
            const newTimeout = setTimeout(() => {
                // Deregister after timeout
                delete service.nodes[n];
                if (Object.keys(service.nodes).length === 0) {
                    serviceRegistry.registry.delete(fullServiceName);
                }
                serviceRegistry.removeNodeFromRegistry(fullServiceName, n);
            }, (node.timeOut || config.heartBeatTimeout) * 1000);
            serviceRegistry.timeResetters.set(n, newTimeout);
        }
    }
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Heartbeat received" });
}

const deregisterController = (req, res) => {
    const { serviceName, nodeName, namespace, tenantId } = req.body;
    if (!serviceName || !nodeName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName or nodeName" });
        return;
    }
    const success = registryService.deregisterService(serviceName, nodeName, namespace, undefined, undefined, tenantId);
    if (success) {
        audit(`DEREGISTER: service ${serviceName} node ${nodeName}`);
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
    const limit = pLimit(config.healthCheckConcurrency);
    const healthPromises = Object.entries(nodes).map(([nodeName, node]) => limit(async () => {
        try {
            const healthUrl = node.address + (node.metadata.healthEndpoint || '/health');
            const url = new URL(healthUrl);
            const client = url.protocol === 'https:' ? https : http;
            const response = await new Promise((resolve, reject) => {
                const req = client.request({
                    hostname: url.hostname,
                    port: url.port,
                    path: url.pathname + url.search,
                    method: 'GET',
                    timeout: 5000
                }, (res) => {
                    resolve({ status: res.statusCode });
                    req.destroy();
                });
                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Timeout'));
                });
                req.end();
            });
            // Update registry with healthy status
            const service = serviceRegistry.registry.get(fullServiceName);
            if (service && service.nodes[nodeName]) {
                const nodeObj = service.nodes[nodeName];
                nodeObj.healthy = true;
                nodeObj.failureCount = 0;
                nodeObj.lastFailureTime = null;
                serviceRegistry.addToHealthyNodes(fullServiceName, nodeName);
                serviceRegistry.debounceSave();
            }
            return [nodeName, { status: 'healthy', code: response.status }];
        } catch (error) {
            // Update registry with unhealthy status
            const service = serviceRegistry.registry.get(fullServiceName);
            if (service && service.nodes[nodeName]) {
                const nodeObj = service.nodes[nodeName];
                nodeObj.healthy = false;
                nodeObj.failureCount = (nodeObj.failureCount || 0) + 1;
                nodeObj.lastFailureTime = Date.now();
                serviceRegistry.removeFromHealthyNodes(fullServiceName, nodeName);
                serviceRegistry.debounceSave();
            }
            return [nodeName, { status: 'unhealthy', error: error.message }];
        }
    } ) );
    const healthResultsArray = await Promise.all(healthPromises);
    const healthResults = Object.fromEntries(healthResultsArray);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ serviceName, namespace, health: healthResults });
}

const bulkHealthController = async (req, res) => {
    const serviceNames = req.body.serviceNames;
    const namespace = req.body.namespace || "default";
    const version = req.body.version;
    if (!serviceNames || !Array.isArray(serviceNames)) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing or invalid serviceNames array" });
        return;
    }
    const results = {};
    for (const serviceName of serviceNames) {
    const fullServiceName = version ? `${namespace}:${serviceName}:${version}` : `${namespace}:${serviceName}`;
        const nodes = serviceRegistry.getNodes(fullServiceName);
        if (!nodes || Object.keys(nodes).length === 0) {
            results[serviceName] = { error: "Service not found" };
            continue;
        }
    const limit = pLimit(config.healthCheckConcurrency);
        const healthPromises = Object.entries(nodes).map(([nodeName, node]) => limit(async () => {
            try {
                const healthUrl = node.address + (node.metadata.healthEndpoint || '/health');
                const url = new URL(healthUrl);
                const client = url.protocol === 'https:' ? https : http;
                const response = await new Promise((resolve, reject) => {
                    const req = client.request({
                        hostname: url.hostname,
                        port: url.port,
                        path: url.pathname + url.search,
                        method: 'GET',
                        timeout: 5000
                    }, (res) => {
                        resolve({ status: res.statusCode });
                        req.destroy();
                    });
                    req.on('error', reject);
                    req.on('timeout', () => {
                        req.destroy();
                        reject(new Error('Timeout'));
                    });
                    req.end();
                });
                // Update registry with healthy status
                const service = serviceRegistry.registry.get(fullServiceName);
                if (service && service.nodes[nodeName]) {
                    const nodeObj = service.nodes[nodeName];
                    nodeObj.healthy = true;
                    nodeObj.failureCount = 0;
                    nodeObj.lastFailureTime = null;
                    serviceRegistry.addToHealthyNodes(fullServiceName, nodeName);
                    serviceRegistry.debounceSave();
                }
                return [nodeName, { status: 'healthy', code: response.status }];
            } catch (error) {
                // Update registry with unhealthy status
                const service = serviceRegistry.registry.get(fullServiceName);
                if (service && service.nodes[nodeName]) {
                    const nodeObj = service.nodes[nodeName];
                    nodeObj.healthy = false;
                    nodeObj.failureCount = (nodeObj.failureCount || 0) + 1;
                    nodeObj.lastFailureTime = Date.now();
                    serviceRegistry.removeFromHealthyNodes(fullServiceName, nodeName);
                    serviceRegistry.debounceSave();
                }
                return [nodeName, { status: 'unhealthy', error: error.message }];
            }
        } ) );
        const healthResultsArray = await Promise.all(healthPromises);
        const healthResults = Object.fromEntries(healthResultsArray);
        results[serviceName] = { namespace, health: healthResults };
    }
    res.status(statusAndMsgs.STATUS_SUCCESS).json(results);
}

const filteredDiscoveryController = (req, res) => {
    const startTime = Date.now();
    const serviceName = req.query.serviceName;
    const version = req.query.version || "1.0";
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
    const healthyNodeNames = serviceRegistry.getHealthyNodes(fullServiceName, undefined, tags);
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
        const taggedNodes = taggedSets.reduce((acc, set) => new Set([...acc].filter(x => set.has(x))), taggedSets[0] || new Set());
        filteredNodes = healthyNodeNames.filter(nodeName => taggedNodes.has(nodeName));
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
    const service = serviceRegistry.registry.get(fullServiceName);
    if (!service) {
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, false, latency);
        metricsService.recordError('service_unavailable');
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
            "message" : statusAndMsgs.MSG_SERVICE_UNAVAILABLE
        });
        return;
    }
    const offset = service.filteredOffset || 0;
    service.filteredOffset = (offset + 1) % filteredNodes.length;
    const selectedNodeName = filteredNodes[offset];
    const serviceNode = nodes[selectedNodeName];

    const addressToRedirect = serviceNode.address + (endPoint.length > 0 ? (endPoint[0] == "/" ? endPoint : `/${endPoint}`) : "");
    info(`Filtered proxying to ${addressToRedirect}`);

    // Increment active connections
    serviceRegistry.incrementActiveConnections(fullServiceName, serviceNode.nodeName);

    try {
        proxy.web(req, res, { target: addressToRedirect, changeOrigin: true });
    } catch (err) {
        consoleError('Proxy setup error:', err);
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

const prometheusMetricsController = async (req, res) => {
    try {
        const prometheusOutput = await metricsService.getPrometheusMetrics();
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(prometheusOutput);
    } catch (err) {
        consoleError('Error getting Prometheus metrics:', err);
        res.status(500).json({ error: 'Failed to get metrics' });
    }
}

const cacheStatsController = (req, res) => {
    const stats = {
        cacheSize: discoveryService.cache.size,
        cacheMax: discoveryService.cache.max,
        cacheTTL: discoveryService.cache.ttl,
        serviceKeysCount: discoveryService.serviceKeys.size,
        cacheHits: discoveryService.cacheHits,
        cacheMisses: discoveryService.cacheMisses
    };
    res.status(statusAndMsgs.STATUS_SUCCESS).json(stats);
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

    if(!serviceNode){
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

const setMaintenanceController = (req, res) => {
    const { serviceName, nodeName, namespace, maintenance } = req.body;
    if (!serviceName || !nodeName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName or nodeName" });
        return;
    }
    const fullServiceName = namespace ? `${namespace}:${serviceName}` : serviceName;
    serviceRegistry.setMaintenanceMode(fullServiceName, nodeName, maintenance === true);
    discoveryService.invalidateServiceCache(fullServiceName);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Maintenance mode updated" });
}

const setDrainingController = (req, res) => {
    const { serviceName, nodeName, namespace, draining } = req.body;
    if (!serviceName || !nodeName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName or nodeName" });
        return;
    }
    const fullServiceName = namespace ? `${namespace}:${serviceName}` : serviceName;
    serviceRegistry.setDrainingMode(fullServiceName, nodeName, draining === true);
    discoveryService.invalidateServiceCache(fullServiceName);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Draining mode updated" });
}

const healthHistoryController = (req, res) => {
    const serviceName = req.query.serviceName;
    const nodeName = req.query.nodeName;
    const namespace = req.query.namespace || "default";
    if (!serviceName || !nodeName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName or nodeName" });
        return;
    }
    const fullServiceName = `${namespace}:${serviceName}`;
    const history = serviceRegistry.getHealthHistory(fullServiceName, nodeName);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ serviceName, nodeName, namespace, history });
}

const backupController = (req, res) => {
    const data = serviceRegistry.backup();
    res.setHeader('Content-Disposition', 'attachment; filename="maxine-backup.json"');
    res.setHeader('Content-Type', 'application/json');
    res.status(statusAndMsgs.STATUS_SUCCESS).json(data);
}

const restoreController = (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Invalid backup data" });
        return;
    }
    try {
        serviceRegistry.restore(data);
        res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Registry restored successfully" });
    } catch (error) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Failed to restore registry", error: error.message });
    }
}

const dependencyGraphController = (req, res) => {
    const graph = {};
    for (const [service, deps] of serviceRegistry.serviceDependencies) {
        graph[service] = Array.from(deps);
    }
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ dependencyGraph: graph });
}

const impactAnalysisController = (req, res) => {
    const serviceName = req.query.serviceName;
    if (!serviceName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName" });
        return;
    }
    const impacted = serviceRegistry.getDependentServices(serviceName);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ serviceName, impactedServices: impacted });
}

const setApiSpecController = (req, res) => {
    const { serviceName, nodeName, apiSpec, namespace } = req.body;
    if (!serviceName || !nodeName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName or nodeName" });
        return;
    }
    // Basic validation: check if apiSpec is valid JSON
    let parsedSpec;
    try {
        parsedSpec = JSON.parse(apiSpec);
    } catch (err) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Invalid API spec: must be valid JSON" });
        return;
    }
    // Optional: check for OpenAPI version
    if (!parsedSpec.openapi && !parsedSpec.swagger) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Invalid API spec: missing openapi or swagger version" });
        return;
    }
    // Additional validation: check for required fields
    if (!parsedSpec.info || !parsedSpec.info.title || !parsedSpec.paths) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Invalid API spec: missing required fields (info.title, paths)" });
        return;
    }
    // Check if paths is not empty
    if (Object.keys(parsedSpec.paths).length === 0) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Invalid API spec: paths cannot be empty" });
        return;
    }
    const fullServiceName = namespace ? `${namespace}:${serviceName}` : serviceName;
    const service = serviceRegistry.registry.get(fullServiceName);
    if (!service || !service.nodes[nodeName]) {
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({ message: "Service or node not found" });
        return;
    }
    service.nodes[nodeName].apiSpec = parsedSpec;
    serviceRegistry.debounceSave();
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "API spec updated and validated" });
}

const getApiSpecController = (req, res) => {
    const serviceName = req.query.serviceName;
    const nodeName = req.query.nodeName;
    const namespace = req.query.namespace || "default";
    if (!serviceName || !nodeName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName or nodeName" });
        return;
    }
    const fullServiceName = `${namespace}:${serviceName}`;
    const service = serviceRegistry.registry.get(fullServiceName);
    if (!service || !service.nodes[nodeName]) {
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({ message: "Service or node not found" });
        return;
    }
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ apiSpec: service.nodes[nodeName].apiSpec });
}

const pushHealthController = (req, res) => {
    const { serviceName, nodeName, status, namespace } = req.body;
    if (!serviceName || !nodeName || !status) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName, nodeName, or status" });
        return;
    }
    if (!['healthy', 'unhealthy'].includes(status)) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Status must be 'healthy' or 'unhealthy'" });
        return;
    }
    const fullServiceName = namespace ? `${namespace}:${serviceName}` : serviceName;
    const service = serviceRegistry.registry.get(fullServiceName);
    if (!service || !service.nodes[nodeName]) {
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({ message: "Service or node not found" });
        return;
    }
    const nodeObj = service.nodes[nodeName];
    if (status === 'healthy') {
        nodeObj.healthy = true;
        nodeObj.failureCount = 0;
        nodeObj.lastFailureTime = null;
        serviceRegistry.addToHealthyNodes(fullServiceName, nodeName);
        serviceRegistry.addHealthHistory(fullServiceName, nodeName, true);
    } else {
        nodeObj.healthy = false;
        nodeObj.failureCount = (nodeObj.failureCount || 0) + 1;
        nodeObj.lastFailureTime = Date.now();
        serviceRegistry.removeFromHealthyNodes(fullServiceName, nodeName);
        serviceRegistry.addHealthHistory(fullServiceName, nodeName, false);
    }
    serviceRegistry.debounceSave();
    discoveryService.invalidateServiceCache(fullServiceName);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Health status updated" });
}

const listServicesByGroupController = (req, res) => {
    const { group, namespace } = req.query;
    if (!group) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing group" });
        return;
    }
    const services = [];
    for (const [serviceName, service] of serviceRegistry.registry) {
        if (namespace && !serviceName.startsWith(`${namespace}:`)) continue;
        const healthyNodes = serviceRegistry.getHealthyNodes(serviceName, group);
        if (healthyNodes.length > 0) {
            services.push({
                serviceName,
                nodes: healthyNodes.map(node => ({
                    nodeName: node.nodeName,
                    address: node.address,
                    metadata: node.metadata
                }))
            });
        }
    }
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ services });
}

const updateMetadataController = (req, res) => {
    const { serviceName, nodeName, metadata, namespace } = req.body;
    if (!serviceName || !nodeName || !metadata) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName, nodeName, or metadata" });
        return;
    }
    const fullServiceName = namespace ? `${namespace}:${serviceName}` : serviceName;
    serviceRegistry.updateNodeMetadata(fullServiceName, nodeName, metadata);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Metadata updated" });
}

const changesSSEController = (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
    });
    const since = parseInt(req.query.since) || 0;
    let lastIndex = serviceRegistry.changes.findIndex(c => c.timestamp > since);
    if (lastIndex === -1) lastIndex = serviceRegistry.changes.length;

    const sendChange = (change) => {
        res.write(`data: ${JSON.stringify(change)}\n\n`);
    };

    // Send initial changes since 'since'
    for (let i = lastIndex; i < serviceRegistry.changes.length; i++) {
        sendChange(serviceRegistry.changes[i]);
    }

    // Then send new ones every second
    const interval = setInterval(() => {
        if (serviceRegistry.changes.length > lastIndex) {
            for (let i = lastIndex; i < serviceRegistry.changes.length; i++) {
                sendChange(serviceRegistry.changes[i]);
            }
            lastIndex = serviceRegistry.changes.length;
        }
    }, 1000);

    req.on('close', () => {
        clearInterval(interval);
        res.end();
    });
}

const databaseDiscoveryController = require('./database-discovery-controller');

const pendingServicesController = (req, res) => {
    const pending = registryService.getPendingServices();
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ pendingServices: pending });
};

const approveServiceController = (req, res) => {
    const { serviceName, nodeName } = req.body;
    const service = registryService.approveService(serviceName, nodeName);
    if (service) {
        res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: 'Service approved', service });
    } else {
        res.status(statusAndMsgs.STATUS_NOT_FOUND).json({ message: 'Pending service not found' });
    }
};

const rejectServiceController = (req, res) => {
    const { serviceName, nodeName } = req.body;
    const success = registryService.rejectService(serviceName, nodeName);
    if (success) {
        res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: 'Service rejected' });
    } else {
        res.status(statusAndMsgs.STATUS_NOT_FOUND).json({ message: 'Pending service not found' });
    }
};

const testServiceController = async (req, res) => {
    const { serviceName, nodeName } = req.query;
    const service = serviceRegistry.registry.get(serviceName);
    if (!service || !service.nodes[nodeName]) {
        return res.status(statusAndMsgs.STATUS_NOT_FOUND).json({ message: 'Service or node not found' });
    }
    const node = service.nodes[nodeName];
    const healthEndpoint = node.metadata.healthEndpoint || '/health';
    const healthUrl = `${node.address}${healthEndpoint.startsWith('/') ? healthEndpoint : `/${healthEndpoint}`}`;
    try {
        const axios = require('axios');
        const response = await axios.get(healthUrl, { timeout: 5000 });
        res.status(statusAndMsgs.STATUS_SUCCESS).json({ status: 'healthy', response: response.data });
    } catch (err) {
        res.status(statusAndMsgs.STATUS_SUCCESS).json({ status: 'unhealthy', error: err.message });
    }
};

const addServiceTemplateController = (req, res) => {
    const { name, template } = req.body;
    if (!name || !template) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing name or template" });
        return;
    }
    serviceRegistry.addServiceTemplate(name, template);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Template added" });
};

const getServiceTemplateController = (req, res) => {
    const { name } = req.params;
    const template = serviceRegistry.getServiceTemplate(name);
    if (!template) {
        res.status(statusAndMsgs.STATUS_NOT_FOUND).json({ message: "Template not found" });
        return;
    }
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ template });
};

const deleteServiceTemplateController = (req, res) => {
    const { name } = req.params;
    const deleted = serviceRegistry.deleteServiceTemplate(name);
    if (!deleted) {
        res.status(statusAndMsgs.STATUS_NOT_FOUND).json({ message: "Template not found" });
        return;
    }
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Template deleted" });
};

const listServiceTemplatesController = (req, res) => {
    const templates = serviceRegistry.listServiceTemplates();
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ templates });
};

const setServiceIntentionController = (req, res) => {
    const { source, destination, action } = req.body;
    if (!source || !destination || !['allow', 'deny'].includes(action)) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Invalid parameters" });
        return;
    }
    serviceRegistry.setServiceIntention(source, destination, action);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Service intention set" });
};

const getServiceIntentionController = (req, res) => {
    const { source, destination } = req.query;
    if (!source || !destination) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing parameters" });
        return;
    }
    const action = serviceRegistry.getServiceIntention(source, destination);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ source, destination, action });
};

const addAclPolicyController = (req, res) => {
    const { name, policy } = req.body;
    if (!name || !policy) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing name or policy" });
        return;
    }
    serviceRegistry.addAclPolicy(name, policy);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "ACL policy added" });
};

const getAclPolicyController = (req, res) => {
    const { name } = req.params;
    const policy = serviceRegistry.getAclPolicy(name);
    if (!policy) {
        res.status(statusAndMsgs.STATUS_NOT_FOUND).json({ message: "ACL policy not found" });
        return;
    }
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ name, policy });
};

const deleteAclPolicyController = (req, res) => {
    const { name } = req.params;
    const deleted = serviceRegistry.deleteAclPolicy(name);
    if (!deleted) {
        res.status(statusAndMsgs.STATUS_NOT_FOUND).json({ message: "ACL policy not found" });
        return;
    }
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "ACL policy deleted" });
};

const listAclPoliciesController = (req, res) => {
    const policies = serviceRegistry.listAclPolicies();
    res.status(statusAndMsgs.STATUS_SUCCESS).json(policies);
};

const addToBlacklistController = (req, res) => {
    const { serviceName, nodeName } = req.body;
    if (!serviceName || !nodeName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName or nodeName" });
        return;
    }
    serviceRegistry.addToBlacklist(serviceName, nodeName);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Node added to blacklist" });
};

const removeFromBlacklistController = (req, res) => {
    const { serviceName, nodeName } = req.body;
    if (!serviceName || !nodeName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName or nodeName" });
        return;
    }
    serviceRegistry.removeFromBlacklist(serviceName, nodeName);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Node removed from blacklist" });
};

const getBlacklistedNodesController = (req, res) => {
    const { serviceName } = req.params;
    const blacklisted = serviceRegistry.getBlacklistedNodes(serviceName);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ blacklisted });
};

const getServiceUptimeController = (req, res) => {
    const { serviceName } = req.params;
    const uptime = serviceRegistry.getServiceUptime(serviceName);
    if (uptime === null) {
        res.status(statusAndMsgs.STATUS_NOT_FOUND).json({ message: "Service not found" });
        return;
    }
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ serviceName, uptimeMs: uptime, uptimeHuman: `${Math.floor(uptime / 1000)}s` });
};

const setCanaryController = (req, res) => {
    const { serviceName, percentage, canaryNodes } = req.body;
    if (!serviceName || percentage === undefined || !Array.isArray(canaryNodes)) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName, percentage, or canaryNodes array" });
        return;
    }
    if (percentage < 0 || percentage > 100) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Percentage must be between 0 and 100" });
        return;
    }
    serviceRegistry.setCanary(serviceName, percentage, canaryNodes);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Canary configuration set" });
};

const discoverWeightedController = (req, res) => {
    const serviceName = req.query.serviceName;
    if (!serviceName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName" });
        return;
    }
    const node = serviceRegistry.getRandomNode(serviceName, 'weighted');
    if (!node) {
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({ message: "Service unavailable" });
        return;
    }
    res.json({ address: node.address, nodeName: node.nodeName, healthy: true });
};

const discoverLeastConnectionsController = (req, res) => {
    const serviceName = req.query.serviceName;
    if (!serviceName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName" });
        return;
    }
    const node = serviceRegistry.getRandomNode(serviceName, 'least-connections');
    if (!node) {
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({ message: "Service unavailable" });
        return;
    }
    res.json({ address: node.address, nodeName: node.nodeName, healthy: true });
};

const setBlueGreenController = (req, res) => {
    const { serviceName, blueNodes, greenNodes, activeColor } = req.body;
    if (!serviceName || !Array.isArray(blueNodes) || !Array.isArray(greenNodes)) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName, blueNodes, or greenNodes arrays" });
        return;
    }
    serviceRegistry.setBlueGreen(serviceName, blueNodes, greenNodes, activeColor || 'blue');
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Blue-green configuration set" });
};

// Additional controllers for full mode features
const addFederatedRegistryController = (req, res) => {
    const { name, url } = req.body;
    if (!name || !url) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing name or url" });
        return;
    }
    serviceRegistry.addFederatedRegistry(name, url);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Federated registry added" });
};

const removeFederatedRegistryController = (req, res) => {
    const { name } = req.body;
    if (!name) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing name" });
        return;
    }
    serviceRegistry.removeFederatedRegistry(name);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Federated registry removed" });
};

const startTraceController = (req, res) => {
    const { operation, id } = req.body;
    if (!operation || !id) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing operation or id" });
        return;
    }
    serviceRegistry.startTrace(operation, id);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Trace started" });
};

const addTraceEventController = (req, res) => {
    const { id, event } = req.body;
    if (!id || !event) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing id or event" });
        return;
    }
    serviceRegistry.addTraceEvent(id, event);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Trace event added" });
};

const endTraceController = (req, res) => {
    const { id } = req.body;
    if (!id) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing id" });
        return;
    }
    serviceRegistry.endTrace(id);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Trace ended" });
};

const getTraceController = (req, res) => {
    const { id } = req.params;
    const trace = serviceRegistry.getTrace(id);
    res.status(statusAndMsgs.STATUS_SUCCESS).json(trace);
};

const setACLController = (req, res) => {
    const { serviceName, allow, deny } = req.body;
    if (!serviceName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName" });
        return;
    }
    serviceRegistry.setACL(serviceName, { allow: allow || [], deny: deny || [] });
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "ACL set" });
};

const getACLController = (req, res) => {
    const { serviceName } = req.params;
    const acl = serviceRegistry.getACL(serviceName);
    res.status(statusAndMsgs.STATUS_SUCCESS).json(acl);
};

const setIntentionController = (req, res) => {
    const { source, destination, action } = req.body;
    if (!source || !destination || !action) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing source, destination, or action" });
        return;
    }
    serviceRegistry.setIntention(source, destination, action);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Intention set" });
};

const getIntentionController = (req, res) => {
    const { source, destination } = req.params;
    const intention = serviceRegistry.getIntention(source, destination);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ intention });
};

const addServiceToBlacklistController = (req, res) => {
    const { serviceName } = req.body;
    if (!serviceName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName" });
        return;
    }
    serviceRegistry.addToBlacklist(serviceName);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Service added to blacklist" });
};

const removeServiceFromBlacklistController = (req, res) => {
    const { serviceName } = req.body;
    if (!serviceName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName" });
        return;
    }
    serviceRegistry.removeFromBlacklist(serviceName);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Service removed from blacklist" });
};

const isServiceBlacklistedController = (req, res) => {
    const { serviceName } = req.params;
    const blacklisted = serviceRegistry.isBlacklisted(serviceName);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ blacklisted });
};












module.exports = {
    registryController,
    renewLeaseController,
    heartbeatController,
    serverListController,
    deregisterController,
    healthController,
    bulkHealthController,
    pushHealthController,
    healthHistoryController,
    metricsController,
    prometheusMetricsController,
    cacheStatsController,
    filteredDiscoveryController,
    discoveryInfoController,
    changesController,
    changesSSEController,
    bulkRegisterController,
    bulkDeregisterController,
    setMaintenanceController,
    setDrainingController,
    backupController,
    restoreController,
    dependencyGraphController,
    impactAnalysisController,
    setApiSpecController,
    getApiSpecController,
    listServicesByGroupController,
    updateMetadataController,
    databaseDiscoveryController,
    statsController,
    slaController,
    healthScoreController,
    autoscalingController,
    chaosController,
    pendingServicesController,
    approveServiceController,
    rejectServiceController,
    testServiceController,
    addServiceTemplateController,
    getServiceTemplateController,
    deleteServiceTemplateController,
    listServiceTemplatesController,
    setServiceIntentionController,
    getServiceIntentionController,
    addAclPolicyController,
    getAclPolicyController,
    deleteAclPolicyController,
    listAclPoliciesController,
    addToBlacklistController,
    removeFromBlacklistController,
    getBlacklistedNodesController,
    getServiceUptimeController,
    setCanaryController,
    discoverWeightedController,
    discoverLeastConnectionsController,
    setBlueGreenController,
    addFederatedRegistryController,
    removeFederatedRegistryController,
    startTraceController,
    addTraceEventController,
    endTraceController,
    getTraceController,
    setACLController,
    getACLController,
    setIntentionController,
    getIntentionController,
    addServiceToBlacklistController,
    removeServiceFromBlacklistController,
    isServiceBlacklistedController
};