const { constants } = require("../util/constants/constants");

const highPerfDefault = process.env.HIGH_PERFORMANCE_MODE !== 'false';

const config = {
    logAsync: process.env.LOG_ASYNC === 'false' ? false : true,
    heartBeatTimeout: process.env.HEARTBEAT_TIMEOUT ? parseInt(process.env.HEARTBEAT_TIMEOUT) : 5,
    logJsonPrettify: process.env.LOG_JSON_PRETTIFY === 'true' ? true : false,
     actuatorEnabled: process.env.ACTUATOR_ENABLED === 'true' || (!highPerfDefault && process.env.ACTUATOR_ENABLED !== 'false'),
    statusMonitorEnabled: process.env.STATUS_MONITOR_ENABLED === 'true' || false,
    serverSelectionStrategy: process.env.SERVER_SELECTION_STRATEGY ? constants.SSS[process.env.SERVER_SELECTION_STRATEGY] || constants.SSS.RR : constants.SSS.RR,
    logFormat: process.env.LOG_FORMAT === 'PLAIN' ? constants.LOG_FORMATS.PLAIN : constants.LOG_FORMATS.JSON,
      discoveryCacheTTL: process.env.DISCOVERY_CACHE_TTL ? parseInt(process.env.DISCOVERY_CACHE_TTL) : 3600000, // 1 hour
        discoveryCacheMax: process.env.DISCOVERY_CACHE_MAX ? parseInt(process.env.DISCOVERY_CACHE_MAX) : 1000000,
       aliasCacheMax: process.env.ALIAS_CACHE_MAX ? parseInt(process.env.ALIAS_CACHE_MAX) : 100000,
    failureThreshold: process.env.FAILURE_THRESHOLD ? parseInt(process.env.FAILURE_THRESHOLD) : 3,
    clusteringEnabled: process.env.CLUSTERING_ENABLED !== 'false' && !process.argv.some(arg => arg.includes('mocha')),
    numWorkers: process.env.NUM_WORKERS ? parseInt(process.env.NUM_WORKERS) : require('os').cpus().length,
      healthCheckEnabled: process.env.HEALTH_CHECK_ENABLED === 'true',
      redisEnabled: process.env.REDIS_ENABLED === 'true' && !highPerfDefault,
      redisHost: process.env.REDIS_HOST || 'localhost',
      redisPort: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
      redisPassword: process.env.REDIS_PASSWORD || null,
      etcdEnabled: process.env.ETCD_ENABLED === 'true' && !highPerfDefault,
      etcdHost: process.env.ETCD_HOST || 'localhost',
      etcdPort: process.env.ETCD_PORT ? parseInt(process.env.ETCD_PORT) : 2379,
       kafkaEnabled: process.env.KAFKA_ENABLED === 'true' && !highPerfDefault,
       kafkaBrokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'],
       prometheusEnabled: process.env.PROMETHEUS_ENABLED === 'true' && !highPerfDefault,
       kubernetesEnabled: process.env.KUBERNETES_ENABLED === 'true' && !highPerfDefault,
     prometheusPort: process.env.PROMETHEUS_PORT ? parseInt(process.env.PROMETHEUS_PORT) : 9090,
       metricsEnabled: process.env.METRICS_ENABLED === 'true' && !highPerfDefault,
      highPerformanceMode: highPerfDefault,
      persistenceEnabled: process.env.PERSISTENCE_ENABLED !== 'false' && !highPerfDefault,
     rateLimitMax: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : 10000,
     rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_WINDOW_MS) : 900000, // 15 minutes
       healthCheckInterval: process.env.HEALTH_CHECK_INTERVAL ? parseInt(process.env.HEALTH_CHECK_INTERVAL) : 60000,
            healthCheckConcurrency: process.env.HEALTH_CHECK_CONCURRENCY ? parseInt(process.env.HEALTH_CHECK_CONCURRENCY) : 50,
     defaultProxyMode: process.env.DEFAULT_PROXY_MODE === 'true' || false,
     proxyTimeout: process.env.PROXY_TIMEOUT ? parseInt(process.env.PROXY_TIMEOUT) : 10000,
       circuitBreakerEnabled: process.env.CIRCUIT_BREAKER_ENABLED !== 'false' && !highPerfDefault,
       circuitBreakerFailureThreshold: process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD ? parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD) : 5,
       circuitBreakerTimeout: process.env.CIRCUIT_BREAKER_TIMEOUT ? parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT) : 60000,
       grpcEnabled: process.env.GRPC_ENABLED === 'true' && !highPerfDefault,
      grpcPort: process.env.GRPC_PORT ? parseInt(process.env.GRPC_PORT) : 50051,
        tracingEnabled: process.env.TRACING_ENABLED === 'true' && !highPerfDefault,
         http2Enabled: process.env.HTTP2_ENABLED !== 'false',
         maxInstancesPerService: process.env.MAX_INSTANCES_PER_SERVICE ? parseInt(process.env.MAX_INSTANCES_PER_SERVICE) : 1000,
          consulEnabled: process.env.CONSUL_ENABLED === 'true' && !highPerfDefault,
          consulHost: process.env.CONSUL_HOST || 'localhost',
          consulPort: process.env.CONSUL_PORT ? parseInt(process.env.CONSUL_PORT) : 8500,
          mdnsEnabled: process.env.MDNS_ENABLED === 'true' && !highPerfDefault
}

Object.defineProperty(config, "profile", {
    value: constants.PROFILE,
    writable: false
});

module.exports = config;