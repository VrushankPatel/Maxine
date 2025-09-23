const { statusAndMsgs } = require("../../util/constants/constants");
const { discoveryService } = require("../../service/discovery-service");
const { metricsService } = require("../../service/metrics-service");
const { serviceRegistry } = require("../../entity/service-registry");
const { info } = require("../../util/logging/logging-util");
const httpProxy = require('http-proxy');
const rateLimit = require('express-rate-limit');
const config = require("../../config/config");

// Cache config values for performance
const isHighPerformanceMode = config.highPerformanceMode;
const hasMetrics = config.metricsEnabled;
const isCircuitBreakerEnabled = config.circuitBreakerEnabled;

// Cache for service name building
const serviceNameCache = new Map();

const buildServiceName = (namespace, region, zone, serviceName, version) => {
    const key = `${namespace}:${region}:${zone}:${serviceName}:${version || ''}`;
    if (serviceNameCache.has(key)) {
        return serviceNameCache.get(key);
    }
    const fullServiceName = (region !== "default" || zone !== "default") ?
        (version ? `${namespace}:${region}:${zone}:${serviceName}:${version}` : `${namespace}:${region}:${zone}:${serviceName}`) :
        (version ? `${namespace}:${serviceName}:${version}` : `${namespace}:${serviceName}`);
    serviceNameCache.set(key, fullServiceName);
    return fullServiceName;
};

const http = require('http');
const https = require('https');
const proxy = httpProxy.createProxyServer({
    agent: new http.Agent({
        keepAlive: true,
        maxSockets: 10000, // Optimized for high throughput
        maxFreeSockets: 5000,
        timeout: config.proxyTimeout,
        keepAliveMsecs: 300000
    }),
    httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets: 10000, // Optimized for high throughput
        maxFreeSockets: 5000,
        timeout: config.proxyTimeout,
        keepAliveMsecs: 300000
    }),
    proxyTimeout: config.proxyTimeout, // timeout for proxy requests
    timeout: config.proxyTimeout
});

proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err);
    if (isCircuitBreakerEnabled && req.serviceNode) {
        serviceRegistry.incrementCircuitFailures(req.fullServiceName, req.serviceNode.nodeName);
    }
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
    const group = req.query.group;
    const endPoint = req.query.endPoint || "";
    const ip = req.clientIp || (req.clientIp = req.ip ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        req.connection?.socket?.remoteAddress ||
        'unknown');

    // if serviceName is not there, responding with error
      if(!serviceName) {
          if (hasMetrics && !isHighPerformanceMode) {
              const latency = Date.now() - startTime;
              metricsService.recordRequest(serviceName, false, latency);
              metricsService.recordError('missing_service_name');
          }
          res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_DISCOVER_MISSING_DATA});
          return;
      }

    // Handle traffic splitting if no version specified
    let selectedVersion = version;
    let fullServiceName;
    if (!selectedVersion) {
        const baseServiceName = buildServiceName(namespace, region, zone, serviceName, '');
        const split = serviceRegistry.getTrafficSplit(baseServiceName);
        if (split) {
            const versions = Object.keys(split);
            const total = Object.values(split).reduce((a, b) => a + b, 0);
            let rand = Math.random() * total;
            for (const v of versions) {
                rand -= split[v];
                if (rand <= 0) {
                    selectedVersion = v;
                    fullServiceName = buildServiceName(namespace, region, zone, serviceName, v);
                    break;
                }
            }
        } else {
            fullServiceName = baseServiceName;
        }
    } else {
        fullServiceName = buildServiceName(namespace, region, zone, serviceName, selectedVersion);
    }

    const serviceNode = discoveryService.getNode(fullServiceName, ip);

       // no service node is there so, service unavailable is our error response.
        if(!serviceNode){
           if (hasMetrics && !isHighPerformanceMode) {
               const latency = Date.now() - startTime;
               metricsService.recordRequest(serviceName, false, latency);
               metricsService.recordError('service_unavailable');
           }
           res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
               "message" : statusAndMsgs.MSG_SERVICE_UNAVAILABLE
           });
           return;
       }

       // Check circuit breaker
       if (isCircuitBreakerEnabled && serviceRegistry.isCircuitOpen(fullServiceName, serviceNode.nodeName)) {
           if (hasMetrics && !isHighPerformanceMode) {
               const latency = Date.now() - startTime;
               metricsService.recordRequest(serviceName, false, latency);
               metricsService.recordError('circuit_open');
           }
           res.status(503).json({ message: 'Service temporarily unavailable (circuit open)' });
           return;
       }

        req.fullServiceName = fullServiceName;
        req.serviceNode = serviceNode;
        const addressToRedirect = endPoint ? (endPoint.startsWith('/') ? serviceNode.address + endPoint : serviceNode.address + '/' + endPoint) : serviceNode.address;

      // Check if client wants address only (no proxy)
       if (req.query.proxy === 'false' || (req.query.proxy === undefined && !config.defaultProxyMode)) {
           if (hasMetrics && !isHighPerformanceMode) {
               const latency = Date.now() - startTime;
               metricsService.recordRequest(serviceName, true, latency);
           }
           res.json({ address: addressToRedirect, nodeName: serviceNode.nodeName });
           return;
       }

      // Increment active connections
      if (!isHighPerformanceMode) {
          serviceRegistry.incrementActiveConnections(fullServiceName, serviceNode.nodeName);
      }

    const proxyTimeout = serviceNode.metadata.proxyTimeout || config.proxyTimeout;
    try {
        proxy.web(req, res, { target: addressToRedirect, changeOrigin: true, timeout: proxyTimeout });
     } catch (err) {
          console.error('Proxy setup error:', err);
          if (hasMetrics && !isHighPerformanceMode) {
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
           if (hasMetrics && !isHighPerformanceMode) {
               metricsService.recordRequest(serviceName, success, latency);
           }
             if (success && !isHighPerformanceMode) {
                 // Record response time for LRT algorithm
                 serviceRegistry.recordResponseTime(fullServiceName, serviceNode.nodeName, latency);
             }
            if (!isHighPerformanceMode) {
                serviceRegistry.decrementActiveConnections(fullServiceName, serviceNode.nodeName);
            }
            if (isCircuitBreakerEnabled && req.serviceNode) {
                if (success) {
                    serviceRegistry.onCircuitSuccess(req.fullServiceName, req.serviceNode.nodeName);
                } else {
                    serviceRegistry.incrementCircuitFailures(req.fullServiceName, req.serviceNode.nodeName);
                }
            }
        });
      res.on('close', () => {
          if (!isHighPerformanceMode) {
              serviceRegistry.decrementActiveConnections(fullServiceName, serviceNode.nodeName);
          }
      });
}

module.exports = discoveryController