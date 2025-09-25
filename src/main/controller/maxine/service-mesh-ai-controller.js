const { serviceRegistry } = require('../../entity/service-registry');
const config = require('../../config/config');

// AI-inspired optimization for service mesh configurations
const analyzeTrafficPatterns = (serviceName) => {
  const nodes = serviceRegistry.getNodes(serviceName);
  if (!nodes || Object.keys(nodes).length === 0) return null;

  let totalRequests = 0;
  let totalErrors = 0;
  let totalLatency = 0;
  let nodeCount = 0;
  let peakLoadTimes = [];
  let errorPatterns = [];

  for (const [nodeId, node] of Object.entries(nodes)) {
    const metrics = node.metrics || {};
    totalRequests += metrics.requests || 0;
    totalErrors += metrics.errors || 0;
    totalLatency += metrics.avgResponseTime || 0;
    nodeCount++;

    // Analyze error patterns (simplified ML)
    if (metrics.errors > (metrics.requests || 1) * 0.1) {
      // >10% error rate
      errorPatterns.push('high_error_rate');
    }
    if (metrics.avgResponseTime > 2000) {
      // >2s latency
      errorPatterns.push('high_latency');
    }
  }

  const avgLatency = totalLatency / nodeCount;
  const errorRate = totalErrors / Math.max(totalRequests, 1);

  return {
    serviceName,
    totalRequests,
    errorRate,
    avgLatency,
    nodeCount,
    errorPatterns,
    trafficLoad: totalRequests > 1000 ? 'high' : totalRequests > 100 ? 'medium' : 'low',
  };
};

// ML-inspired circuit breaker optimization
const optimizeCircuitBreaker = (analysis) => {
  const baseConfig = {
    maxRequests: 100,
    interval: '10s',
    timeout: '30s',
    errorPercentThreshold: 50,
  };

  if (analysis.errorRate > 0.5) {
    // High error rate - more aggressive circuit breaking
    return {
      ...baseConfig,
      maxRequests: 10,
      interval: '5s',
      timeout: '15s',
      errorPercentThreshold: 25,
    };
  } else if (analysis.errorRate > 0.2) {
    // Medium error rate - balanced approach
    return {
      ...baseConfig,
      maxRequests: 50,
      interval: '8s',
      timeout: '25s',
      errorPercentThreshold: 40,
    };
  } else if (analysis.trafficLoad === 'high') {
    // High traffic, low errors - more permissive
    return {
      ...baseConfig,
      maxRequests: 200,
      interval: '15s',
      timeout: '45s',
      errorPercentThreshold: 60,
    };
  }

  return baseConfig;
};

// ML-inspired retry optimization
const optimizeRetries = (analysis) => {
  const baseConfig = {
    attempts: 3,
    perTryTimeout: '2s',
    retryOn: '5xx',
  };

  if (analysis.errorPatterns.includes('high_latency')) {
    // High latency - shorter timeouts, fewer retries
    return {
      ...baseConfig,
      attempts: 2,
      perTryTimeout: '1s',
      retryOn: '5xx,timeout',
    };
  } else if (analysis.errorRate > 0.3) {
    // High error rate - more retries but with backoff
    return {
      ...baseConfig,
      attempts: 5,
      perTryTimeout: '3s',
      retryOn: '5xx',
      backoff: {
        baseInterval: '1s',
        maxInterval: '10s',
      },
    };
  } else if (analysis.trafficLoad === 'high') {
    // High traffic - fewer retries to reduce load
    return {
      ...baseConfig,
      attempts: 2,
      perTryTimeout: '1.5s',
    };
  }

  return baseConfig;
};

// ML-inspired load balancing optimization
const optimizeLoadBalancing = (analysis) => {
  if (analysis.nodeCount <= 1) {
    return { strategy: 'round_robin' };
  }

  if (analysis.errorPatterns.includes('high_latency')) {
    // Prefer least latency for high latency services
    return {
      strategy: 'least_request',
      localityAware: true,
    };
  } else if (analysis.trafficLoad === 'high') {
    // Use consistent hashing for high traffic to reduce churn
    return {
      strategy: 'consistent_hash',
      hashKey: 'x-request-id',
    };
  } else {
    // Default to round robin with health checking
    return {
      strategy: 'round_robin',
      healthChecks: {
        interval: '30s',
        timeout: '5s',
        healthyThreshold: 2,
        unhealthyThreshold: 3,
      },
    };
  }
};

const optimizeIstioConfig = (req, res) => {
  const { serviceName } = req.query;
  const services = serviceName
    ? { [serviceName]: serviceRegistry.getRegServers()[serviceName] }
    : serviceRegistry.getRegServers();

  const optimizedConfigs = [];

  for (const [svcName, serviceData] of Object.entries(services)) {
    const analysis = analyzeTrafficPatterns(svcName);
    if (!analysis) continue;

    const circuitBreaker = optimizeCircuitBreaker(analysis);
    const retryPolicy = optimizeRetries(analysis);
    const loadBalancing = optimizeLoadBalancing(analysis);

    // Generate optimized Istio VirtualService and DestinationRule
    const virtualService = {
      apiVersion: 'networking.istio.io/v1beta1',
      kind: 'VirtualService',
      metadata: {
        name: `${svcName}-optimized`,
        namespace: 'default',
      },
      spec: {
        hosts: [svcName],
        http: [
          {
            route: [
              {
                destination: {
                  host: svcName,
                },
              },
            ],
            retries: {
              attempts: retryPolicy.attempts,
              perTryTimeout: retryPolicy.perTryTimeout,
              retryOn: retryPolicy.retryOn,
            },
            timeout: '30s',
          },
        ],
      },
    };

    const destinationRule = {
      apiVersion: 'networking.istio.io/v1beta1',
      kind: 'DestinationRule',
      metadata: {
        name: `${svcName}-optimized`,
        namespace: 'default',
      },
      spec: {
        host: svcName,
        trafficPolicy: {
          loadBalancer: {
            simple:
              loadBalancing.strategy === 'round_robin'
                ? 'ROUND_ROBIN'
                : loadBalancing.strategy === 'least_request'
                  ? 'LEAST_REQUEST'
                  : 'ROUND_ROBIN',
          },
          connectionPool: {
            http: {
              http1MaxPendingRequests: circuitBreaker.maxRequests,
              maxRequestsPerConnection: 10,
            },
          },
          outlierDetection: {
            consecutive5xxErrors: circuitBreaker.errorPercentThreshold,
            interval: circuitBreaker.interval,
            baseEjectionTime: circuitBreaker.timeout,
            maxEjectionPercent: 50,
          },
        },
      },
    };

    optimizedConfigs.push({
      serviceName: svcName,
      analysis,
      virtualService,
      destinationRule,
      recommendations: {
        circuitBreaker,
        retryPolicy,
        loadBalancing,
      },
    });
  }

  res.json({
    optimizedConfigs,
    timestamp: new Date().toISOString(),
    optimizationEngine: 'AI-powered traffic analysis',
  });
};

const optimizeLinkerdConfig = (req, res) => {
  const { serviceName } = req.query;
  const services = serviceName
    ? { [serviceName]: serviceRegistry.getRegServers()[serviceName] }
    : serviceRegistry.getRegServers();

  const optimizedConfigs = [];

  for (const [svcName, serviceData] of Object.entries(services)) {
    const analysis = analyzeTrafficPatterns(svcName);
    if (!analysis) continue;

    const circuitBreaker = optimizeCircuitBreaker(analysis);
    const retryPolicy = optimizeRetries(analysis);

    // Generate optimized Linkerd ServiceProfile
    const serviceProfile = {
      apiVersion: 'linkerd.io/v1alpha2',
      kind: 'ServiceProfile',
      metadata: {
        name: `${svcName}-optimized`,
        namespace: 'default',
      },
      spec: {
        routes: [
          {
            name: 'default',
            condition: {
              all: true,
            },
            responseClasses: [
              {
                condition: {
                  status: {
                    min: 500,
                    max: 599,
                  },
                },
                isFailure: true,
              },
            ],
            timeout: '30s',
            retries: {
              limit: retryPolicy.attempts,
              timeout: retryPolicy.perTryTimeout,
              backoff: retryPolicy.backoff
                ? {
                    base: retryPolicy.backoff.baseInterval,
                    max: retryPolicy.backoff.maxInterval,
                  }
                : undefined,
            },
          },
        ],
      },
    };

    optimizedConfigs.push({
      serviceName: svcName,
      analysis,
      serviceProfile,
      recommendations: {
        circuitBreaker,
        retryPolicy,
      },
    });
  }

  res.json({
    optimizedConfigs,
    timestamp: new Date().toISOString(),
    optimizationEngine: 'AI-powered traffic analysis',
  });
};

const getOptimizationAnalytics = (req, res) => {
  const services = serviceRegistry.getRegServers();
  const analytics = {};

  for (const [serviceName, serviceData] of Object.entries(services)) {
    const analysis = analyzeTrafficPatterns(serviceName);
    if (analysis) {
      analytics[serviceName] = {
        ...analysis,
        circuitBreaker: optimizeCircuitBreaker(analysis),
        retryPolicy: optimizeRetries(analysis),
        loadBalancing: optimizeLoadBalancing(analysis),
      };
    }
  }

  res.json({
    analytics,
    summary: {
      totalServices: Object.keys(analytics).length,
      highTrafficServices: Object.values(analytics).filter((a) => a.trafficLoad === 'high').length,
      highErrorServices: Object.values(analytics).filter((a) => a.errorRate > 0.2).length,
      highLatencyServices: Object.values(analytics).filter((a) => a.avgLatency > 2000).length,
    },
    timestamp: new Date().toISOString(),
  });
};

module.exports = {
  optimizeIstioConfig,
  optimizeLinkerdConfig,
  getOptimizationAnalytics,
};
