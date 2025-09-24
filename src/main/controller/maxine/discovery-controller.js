const { statusAndMsgs } = require("../../util/constants/constants");
const { discoveryService } = require("../../service/discovery-service");
const { metricsService } = require("../../service/metrics-service");
const { serviceRegistry } = require("../../entity/service-registry");
const { info, consoleError } = require("../../util/logging/logging-util");
let httpProxy;
try {
    httpProxy = require('http-proxy');
} catch (e) {
    // http-proxy not available
}
let rateLimit;
try {
    rateLimit = require('express-rate-limit');
} catch (e) {
    // rateLimit not available
}
const config = require("../../config/config");
const { LRUCache } = require('lru-cache');
const stringify = require('fast-json-stringify');
const { buildServiceNameCached } = require("../../util/util");
const semver = require('semver');
const federationService = require('../../service/federation-service');
const crypto = require('crypto');

const generateCorrelationId = () => crypto.randomBytes(16).toString('hex');

// Fast LCG PRNG for ultra-fast mode
let lcgSeed = Date.now();
const lcgA = 1664525;
const lcgC = 1013904223;
const lcgM = 4294967296;

const fastRandom = () => {
    lcgSeed = (lcgA * lcgSeed + lcgC) % lcgM;
    return lcgSeed / lcgM;
};

// Per-service rate limiter
const perServiceLimiter = rateLimit ? rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    keyGenerator: (req) => `${req.query.serviceName || 'unknown'}:${rateLimit ? rateLimit.ipKeyGenerator(req) : req.ip}`,
    message: 'Too many requests for this service from this IP, please try again later.'
}) : null;

// Cache config values for performance
const isHighPerformanceMode = config.highPerformanceMode;
const isUltraFastMode = config.ultraFastMode;
const isExtremeFastMode = config.extremeFastMode;
const isLightningMode = config.lightningMode;
const hasMetrics = config.metricsEnabled && !isUltraFastMode && !isExtremeFastMode && !isLightningMode;
const isCircuitBreakerEnabled = config.circuitBreakerEnabled && !isUltraFastMode && !isExtremeFastMode;

// Optimized caches for better performance and memory efficiency
const ipCache = isUltraFastMode ? null : new LRUCache({ max: isHighPerformanceMode ? 100000 : isExtremeFastMode ? 50000 : 100000, ttl: 900000 });
const addressCache = isUltraFastMode ? null : new LRUCache({ max: isHighPerformanceMode ? 100000 : isExtremeFastMode ? 50000 : 100000, ttl: 900000 });
const serviceNameCache = isUltraFastMode ? null : new LRUCache({ max: isHighPerformanceMode ? 100000 : isExtremeFastMode ? 50000 : 100000, ttl: 900000 });
const nodeMetadataCache = isUltraFastMode ? null : new LRUCache({ max: isHighPerformanceMode ? 50000 : isExtremeFastMode ? 25000 : 50000, ttl: 900000 });
const trafficSplitCache = isUltraFastMode ? null : new LRUCache({ max: isHighPerformanceMode ? 10000 : isExtremeFastMode ? 5000 : 10000, ttl: 300000 }); // Cache traffic split results


// Ultra-fast mode uses no caching for zero-latency

// Fast JSON stringify schemas
const addressResponseSchema = {
    type: 'object',
    properties: {
        address: { type: 'string' },
        nodeName: { type: 'string' },
        healthy: { type: 'boolean' },
        metadata: { type: 'object' }
    }
};
const stringifyAddress = stringify(addressResponseSchema);

const multipleResponseSchema = {
    type: 'object',
    properties: {
        addresses: { type: 'array', items: { type: 'string' } },
        nodeNames: { type: 'array', items: { type: 'string' } },
        healthy: { type: 'array', items: { type: 'boolean' } },
        metadata: { type: 'array', items: { type: 'object' } }
    }
};
const stringifyMultiple = stringify(multipleResponseSchema);



const http = require('http');
const https = require('https');
const proxy = httpProxy ? httpProxy.createProxyServer({
    agent: new http.Agent({
        keepAlive: true,
        maxSockets: 50000, // Optimized for high throughput
        maxFreeSockets: 10000,
        timeout: config.proxyTimeout,
        keepAliveMsecs: 300000
    }),
    httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets: 50000, // Optimized for high throughput
        maxFreeSockets: 10000,
        timeout: config.proxyTimeout,
        keepAliveMsecs: 300000
    }),
    proxyTimeout: config.proxyTimeout, // timeout for proxy requests
    timeout: config.proxyTimeout
}) : null;

if (proxy) {
    proxy.on('error', (err, req, res) => {
        consoleError('Proxy error:', err);
        if (isCircuitBreakerEnabled && req.serviceNode) {
            serviceRegistry.incrementCircuitFailures(req.fullServiceName, req.serviceNode.nodeName);
        }
        if (!res.headersSent) {
            res.status(502);
            res.setHeader('Content-Type', 'application/json');
            res.end(badGatewayBuffer);
        }
    });
}
// Pre-allocated buffers for common responses to avoid allocation overhead
const notFoundBuffer = Buffer.from('{"message": "Service unavailable"}');
const missingServiceNameBuffer = Buffer.from('{"message": "Missing serviceName"}');
const internalErrorBuffer = Buffer.from('{"message": "Internal error"}');
const circuitOpenBuffer = Buffer.from('{"message": "Service temporarily unavailable (circuit open)"}');
const badGatewayBuffer = Buffer.from('{"message": "Bad Gateway"}');

// Pre-built response buffers for ultra-fast mode - optimized to avoid string interpolation
const buildResponseBuffer = (address, nodeName) => {
    // Pre-calculate lengths to avoid reallocations
    const addrLen = address.length;
    const nodeLen = nodeName.length;
    const totalLen = 40 + addrLen + nodeLen; // {"address":"","nodeName":"","healthy":true}
    const buf = Buffer.allocUnsafe(totalLen);
    let offset = 0;
    buf.write('{"address":"', offset); offset += 11;
    buf.write(address, offset); offset += addrLen;
    buf.write('","nodeName":"', offset); offset += 13;
    buf.write(nodeName, offset); offset += nodeLen;
    buf.write('","healthy":true}', offset);
    return buf;
};

const buildMultipleResponseBuffer = (addresses, nodeNames) => {
    // Calculate total length first
    let totalAddrLen = addresses.reduce((sum, a) => sum + a.length + 2, 0) - 1; // quotes and comma
    let totalNodeLen = nodeNames.reduce((sum, n) => sum + n.length + 2, 0) - 1;
    let totalLen = 35 + totalAddrLen + totalNodeLen + (addresses.length * 6); // {"addresses":[...],"nodeNames":[...],"healthy":[true,...]}

    const buf = Buffer.allocUnsafe(totalLen);
    let offset = 0;
    buf.write('{"addresses":[', offset); offset += 14;
    for (let i = 0; i < addresses.length; i++) {
        buf.write('"', offset); offset += 1;
        buf.write(addresses[i], offset); offset += addresses[i].length;
        buf.write(i < addresses.length - 1 ? '",' : '"', offset); offset += 1;
    }
    buf.write('],"nodeNames":[', offset); offset += 14;
    for (let i = 0; i < nodeNames.length; i++) {
        buf.write('"', offset); offset += 1;
        buf.write(nodeNames[i], offset); offset += nodeNames[i].length;
        buf.write(i < nodeNames.length - 1 ? '",' : '"', offset); offset += 1;
    }
    buf.write('],"healthy":[', offset); offset += 12;
    for (let i = 0; i < addresses.length; i++) {
        buf.write(i < addresses.length - 1 ? 'true,' : 'true', offset);
        offset += i < addresses.length - 1 ? 5 : 4;
    }
    buf.write(']}', offset);
    return buf;
};



// Optimized random selection using Fisher-Yates shuffle for better performance
const selectRandomUnique = (array, count) => {
    const len = array.length;
    if (count >= len) return array.slice();
    const shuffled = array.slice();
    // Fisher-Yates shuffle for first 'count' elements
    for (let i = 0; i < count; i++) {
        const rand = Math.random();
        const j = i + Math.floor(rand * (len - i));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
};

// Optimized service name builder for ultra-fast mode
const buildFullServiceName = (serviceName, namespace = "default", datacenter = "default", version) => {
    if (datacenter !== "default") {
        if (version) {
            return `${datacenter}:${namespace}:${serviceName}:${version}`;
        }
        return `${datacenter}:${namespace}:${serviceName}`;
    }
    if (version) {
        return `${namespace}:${serviceName}:${version}`;
    }
    return `${namespace}:${serviceName}`;
};

const ultraFastDiscovery = (req, res) => {
        // Ultra fast: zero-latency discovery with minimal overhead
        const serviceName = req.query.serviceName;
        if (!serviceName) {
            res.status(400).end(missingServiceNameBuffer);
            return;
        }

        // Handle namespace and datacenter for better compatibility - optimized path
        const namespace = req.query.namespace || "default";
        const datacenter = req.query.datacenter || "default";
        const version = req.query.version;
        const fullServiceName = buildFullServiceName(serviceName, namespace, datacenter, version);

        const count = req.query.count ? parseInt(req.query.count) : 1;

        if (count > 1) {
            const serviceData = serviceRegistry.ultraFastHealthyNodes.get(fullServiceName);
            if (!serviceData || serviceData.array.length === 0) {
                res.status(404).end(notFoundBuffer);
                return;
            }
            // For multiple nodes, return up to count random nodes - optimized selection
            const numToReturn = Math.min(count, serviceData.array.length);
            const nodes = [];
            const len = serviceData.array.length;
            for (let i = 0; i < numToReturn && nodes.length < len; i++) {
                let randomIndex = (fastRandom() * len) | 0;
                let attempts = 0;
                while (nodes.some(n => n === serviceData.array[randomIndex]) && attempts < len) {
                    randomIndex = (fastRandom() * len) | 0;
                    attempts++;
                }
                if (attempts < len) {
                    nodes.push(serviceData.array[randomIndex]);
                }
            }
            if (nodes.length === 0) {
                res.status(404).end(notFoundBuffer);
                return;
            }
            const responseBuffer = buildMultipleResponseBuffer(nodes.map(n => n.address), nodes.map(n => n.nodeName));
            res.end(responseBuffer);
        } else {
            const serviceNode = serviceRegistry.ultraFastGetRandomNode(fullServiceName);
            if (!serviceNode) {
                res.status(404).end(notFoundBuffer);
                return;
            }
            const responseBuffer = buildResponseBuffer(serviceNode.address, serviceNode.nodeName);
            res.end(responseBuffer);
        }
    };
const extremeFastDiscovery = (req, res) => {
        // Extreme fast: ultimate performance with no overhead
        const serviceName = req.query.serviceName;
        if (!serviceName) {
            res.status(400).end(missingServiceNameBuffer);
            return;
        }

        // Handle namespace and datacenter
        const namespace = req.query.namespace || "default";
        const datacenter = req.query.datacenter || "default";
        const version = req.query.version;
        const fullServiceName = buildFullServiceName(serviceName, namespace, datacenter, version);

        const serviceNode = serviceRegistry.ultraFastGetRandomNode(fullServiceName);
        if (!serviceNode) {
            res.status(404).end(notFoundBuffer);
            return;
        }
        // Pre-allocated buffer for maximum performance
        res.end(buildResponseBuffer(serviceNode.address, serviceNode.nodeName));
    };



const normalDiscovery = async (req, res) => {
    const startTime = Date.now();
    const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || generateCorrelationId();
    res.setHeader('x-correlation-id', correlationId);
      // Retrieving the serviceName from query params
        const serviceName = req.query.serviceName;
        const version = req.query.version;
        const namespace = req.query.namespace || "default";
        const datacenter = req.query.datacenter || "default";
        const endPoint = req.query.endPoint || "";
        const count = parseInt(req.query.count) || 1;
        const clientId = req.query.clientId;
        const sourceService = req.query.sourceService;
     const reqId = req.ip || 'unknown';
     let ip;
     if (!isUltraFastMode) {
         ip = ipCache.get(reqId);
         if (!ip) {
             ip = req.clientIp || reqId;
             ipCache.set(reqId, ip);
         }
     } else {
         ip = req.clientIp || reqId;
     }

       // if serviceName is not there, responding with error
       if(!serviceName) {
           if (hasMetrics && !isHighPerformanceMode && !isUltraFastMode) {
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
     if (!isUltraFastMode) {
          const serviceNameKey = `${datacenter}:${namespace}:${serviceName}:${selectedVersion || ''}`;
          fullServiceName = serviceNameCache.get(serviceNameKey);
          if (!fullServiceName) {
              if (!selectedVersion) {
                  const baseServiceName = `${datacenter}:${namespace}:${serviceName}`;
                  const splitKey = baseServiceName;
                  let splitResult = trafficSplitCache.get(splitKey);
                  if (splitResult === undefined) {
                      const split = serviceRegistry.getTrafficSplit(baseServiceName);
                      if (split) {
                           const versions = Object.keys(split);
                           const total = Object.values(split).reduce((a, b) => a + b, 0);
                            let rand = Math.random() * total;
                          for (const v of versions) {
                              rand -= split[v];
                              if (rand <= 0) {
                                  selectedVersion = v;
                                  fullServiceName = `${datacenter}:${namespace}:${serviceName}:${v}`;
                                  break;
                              }
                          }
                      } else {
                          fullServiceName = baseServiceName;
                     }
                     // Cache the result: selectedVersion or null if no split
                     trafficSplitCache.set(splitKey, selectedVersion || null);
                 } else {
                      selectedVersion = splitResult;
                      fullServiceName = selectedVersion ? `${datacenter}:${namespace}:${serviceName}:${selectedVersion}` : baseServiceName;
                  }
              } else {
                  fullServiceName = `${datacenter}:${namespace}:${serviceName}:${selectedVersion}`;
              }
             serviceNameCache.set(serviceNameKey, fullServiceName);
         }
      } else {
          // Ultra-fast: no traffic splitting, no caching
          fullServiceName = (datacenter !== "default") ?
              (selectedVersion ? `${datacenter}:${namespace}:${serviceName}:${selectedVersion}` : `${datacenter}:${namespace}:${serviceName}`) :
              (selectedVersion ? `${namespace}:${serviceName}:${selectedVersion}` : `${namespace}:${serviceName}`);
      }

     let serviceNodes;
     if (count > 1) {
         serviceNodes = serviceRegistry.getHealthyNodes(fullServiceName, null, null, null, null, null).slice(0, count);
         if (serviceNodes.length === 0) {
             if (hasMetrics && !isHighPerformanceMode && !isUltraFastMode) {
                 const latency = Date.now() - startTime;
                 metricsService.recordRequest(serviceName, false, latency);
                 metricsService.recordError('service_unavailable');
             }
             res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
                 "message" : statusAndMsgs.MSG_SERVICE_UNAVAILABLE
             });
             return;
         }
     } else {
          const serviceNode = await discoveryService.getNode(fullServiceName, ip, null, null, null, null, clientId);
         serviceNodes = serviceNode ? [serviceNode] : [];
         if (serviceNodes.length === 0) {
             if (hasMetrics && !isHighPerformanceMode && !isUltraFastMode) {
                 const latency = Date.now() - startTime;
                 metricsService.recordRequest(serviceName, false, latency);
                 metricsService.recordError('service_unavailable');
             }
             res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
                 "message" : statusAndMsgs.MSG_SERVICE_UNAVAILABLE
             });
             return;
         }
     }

     // ACL and Intention enforcement
     if (sourceService) {
         const acl = serviceRegistry.getACL(fullServiceName);
         if (acl.deny.includes(sourceService) || (acl.allow.length > 0 && !acl.allow.includes(sourceService))) {
             if (hasMetrics && !isHighPerformanceMode && !isUltraFastMode) {
                 const latency = Date.now() - startTime;
                 metricsService.recordRequest(serviceName, false, latency);
                 metricsService.recordError('access_denied_acl');
             }
             res.status(403).json({ message: "Access denied by ACL" });
             return;
         }
         const intention = serviceRegistry.getServiceIntention(sourceService, fullServiceName);
         if (intention === 'deny') {
             if (hasMetrics && !isHighPerformanceMode && !isUltraFastMode) {
                 const latency = Date.now() - startTime;
                 metricsService.recordRequest(serviceName, false, latency);
                 metricsService.recordError('access_denied_intention');
             }
             res.status(403).json({ message: "Access denied by intention" });
             return;
         }
     }

         // For multiple nodes, always return addresses
         if (count > 1 || req.query.proxy === 'false' || (req.query.proxy === undefined && !config.defaultProxyMode)) {
             if (hasMetrics && !isHighPerformanceMode && !isUltraFastMode) {
                 const latency = Date.now() - startTime;
                 metricsService.recordRequest(serviceName, true, latency);
             }
             res.setHeader('Content-Type', 'application/json');
              const includeMetadata = req.query.metadata === 'true';
              if (count > 1) {
                  const response = {
                      addresses: serviceNodes.map(n => n.address),
                      nodeNames: serviceNodes.map(n => n.nodeName),
                      healthy: serviceNodes.map(n => n.healthy !== false)
                  };
                  if (includeMetadata) {
                      response.metadata = serviceNodes.map(n => n.metadata || {});
                  }
                  res.end(stringifyMultiple(response));
              } else {
                  const response = {
                      address: serviceNodes[0].address,
                      nodeName: serviceNodes[0].nodeName,
                      healthy: serviceNodes[0].healthy !== false
                  };
                  if (includeMetadata) {
                      response.metadata = serviceNodes[0].metadata || {};
                  }
                  res.end(stringifyAddress(response));
              }
             return;
         }

         // For single proxy
         const serviceNode = serviceNodes[0];

         // Check circuit breaker
         if (isCircuitBreakerEnabled && !isUltraFastMode && serviceRegistry.isCircuitOpen(fullServiceName, serviceNode.nodeName)) {
             if (hasMetrics && !isHighPerformanceMode && !isUltraFastMode) {
                 const latency = Date.now() - startTime;
                 metricsService.recordRequest(serviceName, false, latency);
                 metricsService.recordError('circuit_open');
             }
              res.status(503);
              res.setHeader('Content-Type', 'application/json');
              res.end(circuitOpenBuffer);
             return;
         }

             req.fullServiceName = fullServiceName;
             req.serviceNode = serviceNode;
               let addressToRedirect;
               if (!isUltraFastMode) {
                   const addressKey = `${serviceNode.address}:${endPoint || ''}`;
                   addressToRedirect = addressCache.get(addressKey);
                   if (!addressToRedirect) {
                       addressToRedirect = endPoint ? `${serviceNode.address}${endPoint.startsWith('/') ? endPoint : `/${endPoint}`}` : serviceNode.address;
                       addressCache.set(addressKey, addressToRedirect);
                   }
               } else {
                   // Ultra-fast: no caching for address
                   addressToRedirect = endPoint ? `${serviceNode.address}${endPoint.startsWith('/') ? endPoint : `/${endPoint}`}` : serviceNode.address;
               }

         // Increment active connections
         if (!isHighPerformanceMode && !isUltraFastMode) {
             serviceRegistry.incrementActiveConnections(fullServiceName, serviceNode.nodeName);
         }

     let proxyTimeout;
     if (!isUltraFastMode) {
         const proxyTimeoutKey = `${fullServiceName}:${serviceNode.nodeName}`;
         proxyTimeout = nodeMetadataCache.get(proxyTimeoutKey);
         if (proxyTimeout === undefined) {
             proxyTimeout = serviceNode.metadata.proxyTimeout || config.proxyTimeout;
             nodeMetadataCache.set(proxyTimeoutKey, proxyTimeout);
         }
     } else {
         proxyTimeout = serviceNode.metadata.proxyTimeout || config.proxyTimeout;
     }
      // Add custom headers from service metadata if available
      const proxyOptions = { target: addressToRedirect, changeOrigin: true, timeout: proxyTimeout };
      let headers = { ...req.headers };
      if (!isUltraFastMode && serviceNode.metadata && serviceNode.metadata.customHeaders) {
          headers = { ...headers, ...serviceNode.metadata.customHeaders };
      }
      if (serviceNode.metadata && serviceNode.metadata.deprecated) {
          headers['X-Deprecated'] = 'true';
      }
      proxyOptions.headers = headers;

     try {
         proxy.web(req, res, proxyOptions);
         } catch (err) {
            consoleError('Proxy setup error:', err);
            if (hasMetrics && !isHighPerformanceMode && !isUltraFastMode) {
                const latency = Date.now() - startTime;
                metricsService.recordRequest(serviceName, false, latency);
                metricsService.recordError('proxy_error');
            }
            if (!isHighPerformanceMode && !isUltraFastMode) serviceRegistry.decrementActiveConnections(fullServiceName, serviceNode.nodeName);
             res.status(500);
             res.setHeader('Content-Type', 'application/json');
             res.end(internalErrorBuffer);
            return;
        }

        // Record metrics and response time on response finish
         if (!isHighPerformanceMode && !isUltraFastMode) {
             res.on('finish', () => {
                 const latency = Date.now() - startTime;
                 const success = res.statusCode >= 200 && res.statusCode < 300;
                 if (hasMetrics) {
                     metricsService.recordRequest(serviceName, success, latency);
                 }
                    if (success) {
                        // Record response time for LRT algorithm
                        serviceRegistry.recordResponseTime(fullServiceName, serviceNode.nodeName, latency);
                    }

                    // Update AI-driven learning if AI strategy was used
                    const aiStrategy = discoveryService.getStrategy('19'); // AI_DRIVEN
                    if (aiStrategy) {
                        aiStrategy.updateQValue(serviceNode.nodeName, latency, success, fullServiceName, req.ip);
                    }
                  serviceRegistry.decrementActiveConnections(fullServiceName, serviceNode.nodeName);
                  if (isCircuitBreakerEnabled && req.serviceNode) {
                      if (success) {
                          serviceRegistry.onCircuitSuccess(req.fullServiceName, req.serviceNode.nodeName);
                      } else {
                          serviceRegistry.incrementCircuitFailures(req.fullServiceName, req.serviceNode.nodeName);
                      }
                  }
              });
            res.on('close', () => {
                serviceRegistry.decrementActiveConnections(fullServiceName, serviceNode.nodeName);
            });
          }
}

const lightningDiscovery = async (req, res) => {
        // Lightning mode: ultimate speed, only basic discovery
        const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || generateCorrelationId();
        res.setHeader('x-correlation-id', correlationId);
        const serviceName = req.query.serviceName;
        if (!serviceName) {
            res.status(400).end(missingServiceNameBuffer);
            return;
        }

        const namespace = req.query.namespace || "default";
        const datacenter = req.query.datacenter || "default";
        const fullServiceName = datacenter !== "default" ? `${datacenter}:${namespace}:${serviceName}` : `${namespace}:${serviceName}`;
        const sourceService = req.query.sourceService;

        // ACL and Intention enforcement
        if (sourceService) {
            const acl = serviceRegistry.getACL(fullServiceName);
            if (acl.deny.includes(sourceService) || (acl.allow.length > 0 && !acl.allow.includes(sourceService))) {
                res.status(403).end('{"message": "Access denied by ACL"}');
                return;
            }
            const intention = serviceRegistry.getServiceIntention(sourceService, fullServiceName);
            if (intention === 'deny') {
                res.status(403).end('{"message": "Access denied by intention"}');
                return;
            }
        }

        // Simplified for lightning: assume default namespace/datacenter
        const version = req.query.version;
        if (version) fullServiceName += `:${version}`;
        const strategy = req.query.strategy || 'round-robin';
        const clientId = req.query.clientId;
        const tags = req.query.tags ? req.query.tags.split(',') : [];
        let serviceNode = serviceRegistry.ultraFastGetRandomNode(fullServiceName, strategy, clientId);
        if (!serviceNode && config.federationEnabled) {
            // Try federation
            const federatedResults = await federationService.discoverFromFederation(serviceName);
            if (federatedResults.length > 0) {
                // Pick the first result, assuming it's a service instance object
                const federatedService = federatedResults[0];
                serviceNode = {
                    address: federatedService.address,
                    nodeName: federatedService.nodeName || `${serviceName}:${federatedService.address}`,
                    healthy: true,
                    metadata: federatedService.metadata || {}
                };
            }
        }
        if (!serviceNode) {
            res.status(404).end(notFoundBuffer);
            return;
        }
        // Ultimate speed: pre-allocated buffer for minimal JSON - optimized
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
    };

const discoveryController = (req, res) => {
    if (isLightningMode) {
        return lightningDiscovery(req, res);
    }
    if (isExtremeFastMode) {
        return extremeFastDiscovery(req, res);
    }
    if (isUltraFastMode) {
        return ultraFastDiscovery(req, res);
    }
    return normalDiscovery(req, res);
};

module.exports = discoveryController