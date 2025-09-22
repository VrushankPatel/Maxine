const { statusAndMsgs } = require("../../util/constants/constants");
const { discoveryService } = require("../../service/discovery-service");
const { metricsService } = require("../../service/metrics-service");
const _ = require('lodash');
const { info } = require("../../util/logging/logging-util");
const httpProxy = require('http-proxy');
const rateLimit = require('express-rate-limit');
const config = require("../../config/config");

const http = require('http');
const https = require('https');
const proxy = httpProxy.createProxyServer({
    agent: new http.Agent({
        keepAlive: true,
        maxSockets: 50000, // Increased for higher throughput
        maxFreeSockets: 25600,
        timeout: 60000,
        keepAliveMsecs: 30000
    }),
    httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets: 50000, // Increased for higher throughput
        maxFreeSockets: 25600,
        timeout: 60000,
        keepAliveMsecs: 30000
    }),
    proxyTimeout: 30000, // 30 second timeout for proxy requests
    timeout: 30000
});

proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err);
    if (!res.headersSent) {
        res.status(502).json({ message: 'Bad Gateway' });
    }
});

const discoveryController = (req, res) => {
    const startTime = Date.now();
    // Retrieving the serviceName from query params
    const serviceName = req.query.serviceName;
    const version = req.query.version;
    const namespace = req.query.namespace || "default";
    const region = req.query.region || "default";
    const zone = req.query.zone || "default";
    const endPoint = req.query.endPoint || "";
    const ip = req.clientIp || (req.clientIp = req.ip
    || req.connection.remoteAddress
    || req.socket.remoteAddress
    || req.connection.socket.remoteAddress);

    // if serviceName is not there, responding with error
    if(!serviceName) {
        if (config.metricsEnabled) {
            const latency = Date.now() - startTime;
            metricsService.recordRequest(serviceName, false, latency);
            metricsService.recordError('missing_service_name');
        }
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_DISCOVER_MISSING_DATA});
        return;
    }

    // now, retrieving the serviceNode from the registry
    const fullServiceName = (region !== "default" || zone !== "default") ?
        (version ? `${namespace}:${region}:${zone}:${serviceName}:${version}` : `${namespace}:${region}:${zone}:${serviceName}`) :
        (version ? `${namespace}:${serviceName}:${version}` : `${namespace}:${serviceName}`);
    const serviceNode = discoveryService.getNode(fullServiceName, ip);

    // no service node is there so, service unavailable is our error response.
    if(_.isEmpty(serviceNode)){
        if (config.metricsEnabled) {
            const latency = Date.now() - startTime;
            metricsService.recordRequest(serviceName, false, latency);
            metricsService.recordError('service_unavailable');
        }
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
            "message" : statusAndMsgs.MSG_SERVICE_UNAVAILABLE
        });
        return;
    }
    const addressToRedirect = serviceNode.address + (endPoint.length > 0 ? (endPoint[0] == "/" ? endPoint : `/${endPoint}`) : "");

    // Increment active connections
    const { serviceRegistry } = require("../../entity/service-registry");
    serviceRegistry.incrementActiveConnections(fullServiceName, serviceNode.nodeName);

    try {
        proxy.web(req, res, { target: addressToRedirect, changeOrigin: true });
    } catch (err) {
        console.error('Proxy setup error:', err);
        if (config.metricsEnabled) {
            const latency = Date.now() - startTime;
            metricsService.recordRequest(serviceName, false, latency);
            metricsService.recordError('proxy_error');
        }
        serviceRegistry.decrementActiveConnections(fullServiceName, serviceNode.nodeName);
        res.status(500).json({ message: 'Proxy Error' });
        return;
    }

    // Record metrics and response time on response finish
    res.on('finish', () => {
        const latency = Date.now() - startTime;
        const success = res.statusCode >= 200 && res.statusCode < 300;
        if (config.metricsEnabled) {
            metricsService.recordRequest(serviceName, success, latency);
        }
        if (success) {
            // Record response time for LRT algorithm
            const { serviceRegistry } = require("../../entity/service-registry");
            serviceRegistry.recordResponseTime(fullServiceName, serviceNode.nodeName, latency);
        }
        serviceRegistry.decrementActiveConnections(fullServiceName, serviceNode.nodeName);
    });
    res.on('close', () => {
        serviceRegistry.decrementActiveConnections(fullServiceName, serviceNode.nodeName);
    });
}

module.exports = discoveryController