const { statusAndMsgs } = require("../../util/constants/constants");
const { discoveryService } = require("../../service/discovery-service");
const { metricsService } = require("../../service/metrics-service");
const _ = require('lodash');
const { info } = require("../../util/logging/logging-util");
const httpProxy = require('http-proxy');
const rateLimit = require('express-rate-limit');

const http = require('http');
const https = require('https');
const proxy = httpProxy.createProxyServer({
    agent: new http.Agent({ keepAlive: true, maxSockets: 5000, maxFreeSockets: 2560, timeout: 60000 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 5000, maxFreeSockets: 2560, timeout: 60000 })
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
    const endPoint = req.query.endPoint || "";
    const ip = req.ip
    || req.connection.remoteAddress
    || req.socket.remoteAddress
    || req.connection.socket.remoteAddress;

    // if serviceName is not there, responding with error
    if(!serviceName) {
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, false, latency);
        metricsService.recordError('missing_service_name');
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_DISCOVER_MISSING_DATA});
        return;
    }

    // now, retrieving the serviceNode from the registry
    const serviceNode = discoveryService.getNode(serviceName, ip, version);

    // no service node is there so, service unavailable is our error response.
    if(_.isEmpty(serviceNode)){
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, false, latency);
        metricsService.recordError('service_unavailable');
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
            "message" : statusAndMsgs.MSG_SERVICE_UNAVAILABLE
        });
        return;
    }
    const addressToRedirect = serviceNode.address + (endPoint.length > 0 ? (endPoint[0] == "/" ? endPoint : `/${endPoint}`) : "");

    // Increment active connections
    const { serviceRegistry } = require("../../entity/service-registry");
    serviceRegistry.incrementActiveConnections(serviceName, serviceNode.nodeName);

    try {
        proxy.web(req, res, { target: addressToRedirect, changeOrigin: true });
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, true, latency);
        // Record response time for LRT algorithm
        serviceRegistry.recordResponseTime(serviceName, serviceNode.nodeName, latency);
    } catch (err) {
        console.error('Proxy setup error:', err);
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, false, latency);
        metricsService.recordError('proxy_error');
        serviceRegistry.decrementActiveConnections(serviceName, serviceNode.nodeName);
        res.status(500).json({ message: 'Proxy Error' });
    }

    // Decrement on response finish
    res.on('finish', () => {
        serviceRegistry.decrementActiveConnections(serviceName, serviceNode.nodeName);
    });
    res.on('close', () => {
        serviceRegistry.decrementActiveConnections(serviceName, serviceNode.nodeName);
    });
}

module.exports = discoveryController