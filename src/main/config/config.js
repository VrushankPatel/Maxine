const { constants } = require("../util/constants/constants");

const config = {
    logAsync: process.env.LOG_ASYNC === 'false' ? false : true,
    heartBeatTimeout: process.env.HEARTBEAT_TIMEOUT ? parseInt(process.env.HEARTBEAT_TIMEOUT) : 5,
    logJsonPrettify: process.env.LOG_JSON_PRETTIFY === 'true' ? true : false,
    actuatorEnabled: process.env.ACTUATOR_ENABLED === 'false' ? false : true,
    statusMonitorEnabled: process.env.STATUS_MONITOR_ENABLED === 'false' ? false : true,
    serverSelectionStrategy: process.env.SERVER_SELECTION_STRATEGY ? constants.SSS[process.env.SERVER_SELECTION_STRATEGY] || constants.SSS.RR : constants.SSS.RR,
    logFormat: process.env.LOG_FORMAT === 'PLAIN' ? constants.LOG_FORMATS.PLAIN : constants.LOG_FORMATS.JSON,
    discoveryCacheTTL: process.env.DISCOVERY_CACHE_TTL ? parseInt(process.env.DISCOVERY_CACHE_TTL) : 300000,
    failureThreshold: process.env.FAILURE_THRESHOLD ? parseInt(process.env.FAILURE_THRESHOLD) : 3,
    clusteringEnabled: process.env.CLUSTERING_ENABLED === 'true' && !process.argv.some(arg => arg.includes('mocha')),
    numWorkers: process.env.NUM_WORKERS ? parseInt(process.env.NUM_WORKERS) : require('os').cpus().length,
    healthCheckEnabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    redisEnabled: process.env.REDIS_ENABLED === 'true' || false,
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
    redisPassword: process.env.REDIS_PASSWORD || null,
    metricsEnabled: process.env.METRICS_ENABLED !== 'false',
    highPerformanceMode: process.env.HIGH_PERFORMANCE_MODE === 'true' || process.env.HIGH_PERFORMANCE_MODE === undefined,
    rateLimitMax: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : 10000,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_WINDOW_MS) : 900000, // 15 minutes
    healthCheckInterval: process.env.HEALTH_CHECK_INTERVAL ? parseInt(process.env.HEALTH_CHECK_INTERVAL) : 60000,
    healthCheckConcurrency: process.env.HEALTH_CHECK_CONCURRENCY ? parseInt(process.env.HEALTH_CHECK_CONCURRENCY) : 1000,
    proxyTimeout: process.env.PROXY_TIMEOUT ? parseInt(process.env.PROXY_TIMEOUT) : 10000
}

Object.defineProperty(config, "profile", {
    value: constants.PROFILE,
    writable: false
});

module.exports = config;