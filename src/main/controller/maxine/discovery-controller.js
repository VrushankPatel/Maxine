const { statusAndMsgs } = require("../../util/constants/constants");
const { discoveryService } = require("../../service/discovery-service");
const { metricsService } = require("../../service/metrics-service");
const { serviceRegistry } = require("../../entity/service-registry");
const { info } = require("../../util/logging/logging-util");
const httpProxy = require('http-proxy');
const rateLimit = require('express-rate-limit');
const config = require("../../config/config");

const http = require('http');
const https = require('https');
const proxy = httpProxy.createProxyServer({
    agent: new http.Agent({
        keepAlive: true,
        maxSockets: 50000, // Optimized for high throughput
        maxFreeSockets: 25000,
        timeout: config.proxyTimeout,
        keepAliveMsecs: 300000
    }),
    httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets: 50000, // Optimized for high throughput
        maxFreeSockets: 25000,
        timeout: config.proxyTimeout,
        keepAliveMsecs: 300000
    }),
    proxyTimeout: config.proxyTimeout, // timeout for proxy requests
    timeout: config.proxyTimeout
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
         if (config.metricsEnabled && !config.highPerformanceMode) {
             const latency = Date.now() - startTime;
             metricsService.recordRequest(serviceName, false, latency);
             metricsService.recordError('missing_service_name');
         }
         res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_DISCOVER_MISSING_DATA});
         return;
     }

    // Build base service name
    const baseServiceName = (region !== "default" || zone !== "default") ?
        `${namespace}:${region}:${zone}:${serviceName}` : `${namespace}:${serviceName}`;

    // Handle traffic splitting if no version specified
    if (!version) {
        const split = serviceRegistry.getTrafficSplit(baseServiceName);
        if (split) {
            const versions = Object.keys(split);
            const total = Object.values(split).reduce((a, b) => a + b, 0);
            let rand = Math.random() * total;
            for (const v of versions) {
                rand -= split[v];
                if (rand <= 0) {
                    version = v;
                    break;
                }
            }
        }
    }

    // Build full service name
    let fullServiceName = version ? `${baseServiceName}:${version}` : baseServiceName;

    const serviceNode = discoveryService.getNode(fullServiceName, ip);

     // no service node is there so, service unavailable is our error response.
      if(!serviceNode){
         if (config.metricsEnabled && !config.highPerformanceMode) {
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

    // Check if client wants address only (no proxy)
     if (req.query.proxy === 'false') {
         if (config.metricsEnabled && !config.highPerformanceMode) {
             const latency = Date.now() - startTime;
             metricsService.recordRequest(serviceName, true, latency);
         }
         res.json({ address: addressToRedirect, nodeName: serviceNode.nodeName });
         return;
     }

     // Increment active connections
     if (!config.highPerformanceMode) {
         serviceRegistry.incrementActiveConnections(fullServiceName, serviceNode.nodeName);
     }

    const proxyTimeout = serviceNode.metadata.proxyTimeout || config.proxyTimeout;
    try {
        proxy.web(req, res, { target: addressToRedirect, changeOrigin: true, timeout: proxyTimeout });
    } catch (err) {
         console.error('Proxy setup error:', err);
         if (config.metricsEnabled && !config.highPerformanceMode) {
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
         if (config.metricsEnabled && !config.highPerformanceMode) {
             metricsService.recordRequest(serviceName, success, latency);
         }
           if (success && !config.highPerformanceMode) {
               // Record response time for LRT algorithm
               serviceRegistry.recordResponseTime(fullServiceName, serviceNode.nodeName, latency);
           }
          if (!config.highPerformanceMode) {
              serviceRegistry.decrementActiveConnections(fullServiceName, serviceNode.nodeName);
          }
      });
     res.on('close', () => {
         if (!config.highPerformanceMode) {
             serviceRegistry.decrementActiveConnections(fullServiceName, serviceNode.nodeName);
         }
     });
}

module.exports = discoveryController