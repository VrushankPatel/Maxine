const { constants } = require("../util/constants/constants");


// Performance modes - simplified to lightning mode only
let lightningDefault = process.env.LIGHTNING_MODE !== 'false'; // Lightning mode: ultimate speed, only basic discovery/registration
let ultraFastDefault = process.env.ULTRA_FAST_MODE === 'true'; // Ultra-fast mode: extreme performance with minimal features
let highPerfDefault = false; // High performance mode: balanced performance and features
let extremeFastDefault = false; // Extreme fast mode: maximum speed, minimal features

// Ultra-fast modes can be controlled via environment variables
const isTestMode = process.argv.some(arg => arg.includes('mocha'));
if (isTestMode) {
    ultraFastDefault = process.env.ULTRA_FAST_MODE === 'true';
    highPerfDefault = false;
    extremeFastDefault = false;
    lightningDefault = process.env.LIGHTNING_MODE === 'true';
}

// Config hot-reload
const fs = require('fs');
const path = require('path');

const lightningMode = process.env.LIGHTNING_MODE === 'true' || lightningDefault;
const ultraFastMode = process.env.ULTRA_FAST_MODE === 'true' || ultraFastDefault;

const config = {
    isTestMode: isTestMode,
    ultraFastMode: ultraFastDefault,
    extremeFastMode: extremeFastDefault,
    lightningMode: lightningMode,
    logAsync: process.env.LOG_ASYNC === 'false' ? false : true,
    heartBeatTimeout: process.env.HEARTBEAT_TIMEOUT ? parseInt(process.env.HEARTBEAT_TIMEOUT) : 30,
    cleanupInterval: process.env.CLEANUP_INTERVAL ? parseInt(process.env.CLEANUP_INTERVAL) : 30000,
    logJsonPrettify: process.env.LOG_JSON_PRETTIFY === 'true' ? true : false,
       actuatorEnabled: process.env.ACTUATOR_ENABLED === 'true' || (!highPerfDefault && !ultraFastDefault && !extremeFastDefault && process.env.ACTUATOR_ENABLED !== 'false') || isTestMode,
       dashboardEnabled: process.env.DASHBOARD_ENABLED === 'true' || (!extremeFastDefault && process.env.DASHBOARD_ENABLED !== 'false'),
    statusMonitorEnabled: process.env.STATUS_MONITOR_ENABLED === 'true' || false,
     serverSelectionStrategy: process.env.SERVER_SELECTION_STRATEGY ? constants.SSS[process.env.SERVER_SELECTION_STRATEGY] || constants.SSS.RR : constants.SSS.RR,
    logFormat: process.env.LOG_FORMAT === 'PLAIN' ? constants.LOG_FORMATS.PLAIN : constants.LOG_FORMATS.JSON,
              discoveryCacheTTL: process.env.DISCOVERY_CACHE_TTL ? parseInt(process.env.DISCOVERY_CACHE_TTL) : (ultraFastDefault ? 7200000 : (lightningDefault ? 30000 : 3600000)), // 30s in lightning for faster cache
             discoveryCacheMax: process.env.DISCOVERY_CACHE_MAX ? parseInt(process.env.DISCOVERY_CACHE_MAX) : (ultraFastDefault ? 2000000 : (highPerfDefault ? 2000000 : (lightningDefault ? 1000000 : 500000))),
            aliasCacheMax: process.env.ALIAS_CACHE_MAX ? parseInt(process.env.ALIAS_CACHE_MAX) : (ultraFastDefault ? 1000000 : (highPerfDefault ? 1000000 : 200000)),
    failureThreshold: process.env.FAILURE_THRESHOLD ? parseInt(process.env.FAILURE_THRESHOLD) : 3,
           clusteringEnabled: process.env.CLUSTERING_ENABLED !== 'false' && !process.argv.some(arg => arg.includes('mocha')), // Enabled in lightning mode for better performance, note: registry is per-worker, use Redis for shared
    numWorkers: process.env.NUM_WORKERS ? parseInt(process.env.NUM_WORKERS) : require('os').cpus().length,
                 healthCheckEnabled: process.env.HEALTH_CHECK_ENABLED === 'true' && !ultraFastDefault && !extremeFastDefault || lightningDefault, // Enable health checks in lightning mode for all features
           redisEnabled: process.env.REDIS_ENABLED === 'true' && !lightningMode,
       redisHost: process.env.REDIS_HOST || 'localhost',
       redisPort: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
       redisPassword: process.env.REDIS_PASSWORD || null,
        etcdEnabled: process.env.ETCD_ENABLED === 'true' && !isTestMode && !ultraFastDefault,
      etcdHost: process.env.ETCD_HOST || 'localhost',
      etcdPort: process.env.ETCD_PORT ? parseInt(process.env.ETCD_PORT) : 2379,
          kafkaEnabled: process.env.KAFKA_ENABLED === 'true' && !isTestMode && !ultraFastDefault,
        kafkaBrokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'],
           pulsarEnabled: process.env.PULSAR_ENABLED === 'true' && !isTestMode && !ultraFastDefault,
         pulsarServiceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
         pulsarTopic: process.env.PULSAR_TOPIC || 'maxine-registry-events',
          natsEnabled: process.env.NATS_ENABLED === 'true' && !isTestMode && !ultraFastDefault,
        natsServers: process.env.NATS_SERVERS ? process.env.NATS_SERVERS.split(',') : ['nats://localhost:4222'],
        natsSubject: process.env.NATS_SUBJECT || 'maxine.registry.events',
          mqttEnabled: process.env.MQTT_ENABLED === 'true' && !isTestMode && !ultraFastDefault,
        mqttBroker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
        mqttTopic: process.env.MQTT_TOPIC || 'maxine/registry/events',
         prometheusEnabled: process.env.PROMETHEUS_ENABLED === 'true' && !isTestMode,
         kubernetesEnabled: process.env.KUBERNETES_ENABLED === 'true' && !isTestMode,
     prometheusPort: process.env.PROMETHEUS_PORT ? parseInt(process.env.PROMETHEUS_PORT) : 9090,
           metricsEnabled: process.env.METRICS_ENABLED !== 'false' && !ultraFastDefault && !extremeFastDefault || lightningDefault, // Enabled in lightning mode for all features
    highPerformanceMode: highPerfDefault && !ultraFastDefault,
    noLogging: ultraFastDefault || extremeFastDefault || lightningDefault,
          persistenceEnabled: process.env.PERSISTENCE_ENABLED === 'true', // Optional persistence
        persistenceType: process.env.PERSISTENCE_TYPE || 'file', // file, redis, postgres, mysql, mongo, cassandra
      rateLimitMax: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : (ultraFastDefault ? 1000000 : 10000),
     rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_WINDOW_MS) : 900000, // 15 minutes
                 healthCheckInterval: process.env.HEALTH_CHECK_INTERVAL ? parseInt(process.env.HEALTH_CHECK_INTERVAL) : (ultraFastDefault ? 30000 : 30000), // Same interval for reliability
                healthCheckConcurrency: process.env.HEALTH_CHECK_CONCURRENCY ? parseInt(process.env.HEALTH_CHECK_CONCURRENCY) : (ultraFastDefault ? 100 : 50), // Higher concurrency in ultra-fast for speed
     defaultProxyMode: process.env.DEFAULT_PROXY_MODE === 'true' || false,
     proxyTimeout: process.env.PROXY_TIMEOUT ? parseInt(process.env.PROXY_TIMEOUT) : 10000,
           circuitBreakerEnabled: process.env.CIRCUIT_BREAKER_ENABLED !== 'false' && !highPerfDefault && !ultraFastDefault || lightningDefault,
       circuitBreakerFailureThreshold: process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD ? parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD) : 5,
       circuitBreakerTimeout: process.env.CIRCUIT_BREAKER_TIMEOUT ? parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT) : 60000,
          grpcEnabled: process.env.GRPC_ENABLED === 'true' && !isTestMode && !ultraFastDefault,
      grpcPort: process.env.GRPC_PORT ? parseInt(process.env.GRPC_PORT) : 50051,
           tracingEnabled: process.env.TRACING_ENABLED === 'true' && !isTestMode,
                    http2Enabled: process.env.HTTP2_ENABLED !== 'false' && (ultraFastDefault || highPerfDefault), // Disabled in lightning for simplicity
         maxInstancesPerService: process.env.MAX_INSTANCES_PER_SERVICE ? parseInt(process.env.MAX_INSTANCES_PER_SERVICE) : 1000,
           consulEnabled: process.env.CONSUL_ENABLED === 'true' && !isTestMode,
          consulHost: process.env.CONSUL_HOST || 'localhost',
          consulPort: process.env.CONSUL_PORT ? parseInt(process.env.CONSUL_PORT) : 8500,
            mdnsEnabled: process.env.MDNS_ENABLED === 'true' && !isTestMode,
            eurekaEnabled: process.env.EUREKA_ENABLED === 'true' && !isTestMode,
           eurekaHost: process.env.EUREKA_HOST || 'localhost',
           eurekaPort: process.env.EUREKA_PORT ? parseInt(process.env.EUREKA_PORT) : 8761,
            approvalRequired: (process.env.APPROVAL_REQUIRED === 'true' && !ultraFastDefault) && !isTestMode, // Disabled for performance and tests
             alertWebhook: process.env.ALERT_WEBHOOK,
              ecsEnabled: process.env.ECS_ENABLED === 'true' && !isTestMode,
              zookeeperEnabled: process.env.ZOOKEEPER_ENABLED === 'true' && !isTestMode,
              zookeeperHost: process.env.ZOOKEEPER_HOST || 'localhost',
              zookeeperPort: process.env.ZOOKEEPER_PORT ? parseInt(process.env.ZOOKEEPER_PORT) : 2181,

                 nomadEnabled: process.env.NOMAD_ENABLED === 'true' && !isTestMode,
                 nomadHost: process.env.NOMAD_HOST || 'localhost',
                 nomadPort: process.env.NOMAD_PORT ? parseInt(process.env.NOMAD_PORT) : 4646,
                   swarmEnabled: process.env.SWARM_ENABLED === 'true' && !isTestMode,
                   cloudMapEnabled: process.env.CLOUDMAP_ENABLED === 'true' && !isTestMode,
                  swarmHost: process.env.SWARM_HOST || 'localhost',
                  swarmPort: process.env.SWARM_PORT ? parseInt(process.env.SWARM_PORT) : 2376,
                  mongoEnabled: process.env.MONGO_ENABLED === 'true' && !isTestMode,
                  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017/maxine',
                  postgresEnabled: process.env.POSTGRES_ENABLED === 'true' && !isTestMode,
                  postgresUrl: process.env.POSTGRES_URL || 'postgresql://user:password@localhost:5432/maxine',
                   mysqlEnabled: process.env.MYSQL_ENABLED === 'true' && !isTestMode,
                   mysqlUrl: process.env.MYSQL_URL || 'mysql://user:password@localhost:3306/maxine',
                   cassandraEnabled: process.env.CASSANDRA_ENABLED === 'true' && !isTestMode,
                   cassandraContactPoints: process.env.CASSANDRA_CONTACT_POINTS ? process.env.CASSANDRA_CONTACT_POINTS.split(',') : ['localhost:9042'],
                   cassandraKeyspace: process.env.CASSANDRA_KEYSPACE || 'maxine',
                           udpEnabled: process.env.UDP_ENABLED === 'true', // Optional for speed
                        udpPort: process.env.UDP_PORT ? parseInt(process.env.UDP_PORT) : 8081,
                              tcpEnabled: process.env.TCP_ENABLED === 'true', // Optional for speed
                         tcpPort: process.env.TCP_PORT ? parseInt(process.env.TCP_PORT) : 8082,
                           coapEnabled: process.env.COAP_ENABLED === 'true', // Optional for IoT
                       coapPort: process.env.COAP_PORT ? parseInt(process.env.COAP_PORT) : 5683,
                    datacenter: process.env.DATACENTER || 'default',
                     federationEnabled: process.env.FEDERATION_ENABLED === 'true' && !isTestMode,
                     federationPeers: process.env.FEDERATION_PEERS ? process.env.FEDERATION_PEERS.split(',') : [],
                     federationTimeout: process.env.FEDERATION_TIMEOUT ? parseInt(process.env.FEDERATION_TIMEOUT) : 5000,
                     federationRetryAttempts: process.env.FEDERATION_RETRY_ATTEMPTS ? parseInt(process.env.FEDERATION_RETRY_ATTEMPTS) : 3,
                      authEnabled: process.env.AUTH_ENABLED === 'true' && lightningMode, // Auth only in lightning mode for now
                      jwtSecret: process.env.JWT_SECRET || 'default-secret-change-in-production',
                      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
                      adminUsername: process.env.ADMIN_USERNAME || 'admin',
                      adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '$2b$10$example.hash.here', // Use bcrypt to generate
                       oauth2Enabled: process.env.OAUTH2_ENABLED === 'true',
                       googleClientId: process.env.GOOGLE_CLIENT_ID,
                       googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
                       sessionSecret: process.env.SESSION_SECRET || 'session-secret-change-in-production',
                        mtlsEnabled: process.env.MTLS_ENABLED === 'true',
                        serverCertPath: process.env.SERVER_CERT_PATH || path.join(__dirname, 'certs', 'server.crt'),
                        serverKeyPath: process.env.SERVER_KEY_PATH || path.join(__dirname, 'certs', 'server.key'),
                        caCertPath: process.env.CA_CERT_PATH || path.join(__dirname, 'certs', 'ca.crt'),
                        apiKeyEnabled: process.env.API_KEY_ENABLED === 'true',
                        apiKeyRequired: process.env.API_KEY_REQUIRED === 'true'
}

Object.defineProperty(config, "profile", {
    value: constants.PROFILE,
    writable: false
});

// Hot reload configuration
config.reload = () => {
    // Clear require cache for config
    delete require.cache[require.resolve('./config')];
    // Reload config
    const newConfig = require('./config');
    // Update current config with new values
    Object.assign(config, newConfig);
    console.log('Configuration reloaded');
};

module.exports = config;