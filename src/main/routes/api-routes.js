const RouteBuilder = require('../builders/route-builder');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const { graphqlHTTP } = require('express-graphql');
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const fs = require('fs');
const { schema, root } = require('../graphql/schema');
const { serverListController, registryController, renewLeaseController, heartbeatController, deregisterController, healthController, bulkHealthController, pushHealthController, healthHistoryController, metricsController, prometheusMetricsController, cacheStatsController, filteredDiscoveryController, discoveryInfoController, changesController, changesSSEController, bulkRegisterController, bulkDeregisterController, setMaintenanceController, setDrainingController, backupController, restoreController, dependencyGraphController, impactAnalysisController, setApiSpecController, getApiSpecController, listServicesByGroupController, updateMetadataController, databaseDiscoveryController, statsController, slaController, healthScoreController, autoscalingController, chaosController, pendingServicesController, approveServiceController, rejectServiceController, testServiceController, addServiceTemplateController, getServiceTemplateController, deleteServiceTemplateController, listServiceTemplatesController, setServiceIntentionController, getServiceIntentionController, addAclPolicyController, getAclPolicyController, deleteAclPolicyController, listAclPoliciesController, addToBlacklistController, removeFromBlacklistController, getBlacklistedNodesController, getServiceUptimeController, setCanaryController, discoverWeightedController, discoverLeastConnectionsController, setBlueGreenController, addFederatedRegistryController, removeFederatedRegistryController, startTraceController, addTraceEventController, endTraceController, getTraceController, setACLController, getACLController, setIntentionController, getIntentionController, addServiceToBlacklistController, removeServiceFromBlacklistController, isServiceBlacklistedController } = require('../controller/maxine/registry-controller');
const batchDiscoveryController = require('../controller/maxine/batch-discovery-controller');
const federationController = require('../controller/maxine/federation-controller');

// Redis-backed rate limiting for distributed instances
let redisClient = null;
if (config.redisHost && config.redisPort) {
    try {
        const redis = require('redis');
        redisClient = redis.createClient({
            host: config.redisHost,
            port: config.redisPort,
            password: config.redisPassword || undefined
        });
        redisClient.on('error', (err) => console.error('Redis rate limit error:', err));
    } catch (error) {
        console.log('Redis not available for rate limiting, using memory store');
    }
}

// Advanced Redis-backed rate limiter
const createRedisRateLimiter = (options = {}) => {
    const { windowMs = 15 * 60 * 1000, max = 100, keyGenerator = (req) => req.ip } = options;

    return async (req, res, next) => {
        if (!redisClient) {
            // Fallback to simple in-memory rate limiting (not distributed)
            const key = keyGenerator(req);
            const now = Date.now();
            if (!global.rateLimitStore) global.rateLimitStore = new Map();
            const store = global.rateLimitStore;
            if (!store.has(key)) store.set(key, []);
            const timestamps = store.get(key);
            // Remove old timestamps
            while (timestamps.length > 0 && timestamps[0] < now - windowMs) {
                timestamps.shift();
            }
            if (timestamps.length >= max) {
                return res.status(429).json({ error: 'Too many requests, please try again later.' });
            }
            timestamps.push(now);
            return next();
        }

        const key = `ratelimit:${keyGenerator(req)}`;
        const now = Date.now();
        const windowStart = now - windowMs;

        try {
            // Use Redis pipeline for atomic operations
            const multi = redisClient.multi();
            multi.zremrangebyscore(key, 0, windowStart); // Remove old requests
            multi.zcard(key); // Get current count
            multi.zadd(key, now, now); // Add current request
            multi.pexpire(key, windowMs); // Set expiry

            const results = await multi.exec();
            const currentCount = results[1];

            if (currentCount >= max) {
                return res.status(429).json({ error: 'Too many requests, please try again later.' });
            }

            // Set headers for client
            res.set('X-RateLimit-Limit', max);
            res.set('X-RateLimit-Remaining', Math.max(0, max - currentCount - 1));
            res.set('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

            next();
        } catch (error) {
            console.error('Rate limit error:', error);
            // On Redis error, allow request to prevent blocking
            next();
        }
    };
};
const envoyConfigController = require('../controller/maxine/envoy-controller');
const istioConfigController = require('../controller/maxine/istio-controller');
const linkerdConfigController = require('../controller/maxine/linkerd-controller');
const traefikConfigController = require('../controller/maxine/traefik-controller');
const appMeshConfigController = require('../controller/maxine/appmesh-controller');
const opaPolicyController = require('../controller/maxine/opa-controller');
const kubernetesIngressController = require('../controller/maxine/kubernetes-controller');
const haproxyConfigController = require('../controller/maxine/haproxy-controller');
const nginxConfigController = require('../controller/maxine/nginx-controller');
const { setConfig, getConfig, getAllConfig, deleteConfig, watchConfig } = require('../controller/config-control/config-controller');
const { addWebhook, removeWebhook, getWebhooks } = require('../controller/webhook-controller');
const { addAlias, removeAlias, getAliases } = require('../controller/alias-controller');
const { setKv, getKv, deleteKv, getAllKv } = require('../controller/kv-controller');
const { addDependency, removeDependency, getDependencies, getDependents, getDependencyGraph, detectCycles } = require('../controller/dependency-controller');
const discoveryController = require('../controller/maxine/discovery-controller');
const dashboardController = require('../controller/dashboard-controller');
const dnsController = require('../controller/maxine/dns-controller');
const { signInController } = require('../controller/uac/signin-controller');
const { logsLinkGenController, recentLogsController, recentLogsClearController } = require('../controller/log-control/logs-controller');
const { configuratorController, configurationController } = require('../controller/config-control/configurator-controller');
const { changePwdController } = require('../controller/security/changepwd-controller');
const { authenticationController } = require('../controller/security/authentication-controller');
const { requireRole, requirePermission } = require('../controller/security/authorization-controller');
const { PERMISSIONS } = require('../security/rbac');
const { getRolesController, getUserRolesController, setUserRoleController } = require('../controller/security/role-controller');
const { generateApiKey, revokeApiKey, listApiKeys, validateApiKey } = require('../controller/security/api-key-controller');
const { googleAuth, googleCallback } = require('../controller/security/oauth-controller');
const { injectLatency, injectFailure, resetChaos, getChaosStatus } = require('../controller/maxine/chaos-controller');

const config = require('../config/config');
const isHighPerformanceMode = config.highPerformanceMode;
const isLightningMode = config.lightningMode;

const limiter = isHighPerformanceMode ? null : createRedisRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10000, // limit each IP to 10000 requests per windowMs for non-discovery endpoints
});

const discoveryLimiter = (isHighPerformanceMode || config.ultraFastMode) ? null : createRedisRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 100000, // allow high rate for discovery requests
    keyGenerator: (req) => `${req.query.serviceName || 'unknown'}:${req.ip}`,
});


let maxineApiRoutes = RouteBuilder.createNewRoute();

if (!config.ultraFastMode && !isLightningMode) {
    maxineApiRoutes = maxineApiRoutes
                         .from("logs")
                             .from("download")
                                 .get("",logsLinkGenController)
                             .stepBack()
                             .from("recent")
                                 .get("", recentLogsController)
                                 .get("/clear", recentLogsClearController)
                        .stepToRoot();
}

maxineApiRoutes = maxineApiRoutes
                         .from("maxine")
                             .from("serviceops");

if (!config.ultraFastMode && !isLightningMode) {
    maxineApiRoutes = maxineApiRoutes
                                   .get("servers", authenticationController, limiter, serverListController)
                                   .get("servers/group", authenticationController, limiter, listServicesByGroupController);
}

maxineApiRoutes = maxineApiRoutes
                                         .post("register", (config.ultraFastMode || isLightningMode) ? null : authenticationController, bodyParser.json(), registryController)
                                         .post("heartbeat", bodyParser.json(), heartbeatController)
                                         .post("lease/renew", (config.ultraFastMode || isLightningMode) ? null : authenticationController, bodyParser.json(), renewLeaseController)
                                          .post("config/set", (config.ultraFastMode || isLightningMode) ? null : authenticationController, (config.ultraFastMode || isLightningMode) ? null : limiter, bodyParser.json(), setConfig)
                                          .get("config/get", (config.ultraFastMode || isLightningMode) ? null : authenticationController, (config.ultraFastMode || isLightningMode) ? null : limiter, getConfig)
                                          .get("config/all", (config.ultraFastMode || isLightningMode) ? null : authenticationController, (config.ultraFastMode || isLightningMode) ? null : limiter, getAllConfig)
                                          .get("config/watch", (config.ultraFastMode || isLightningMode) ? null : authenticationController, (config.ultraFastMode || isLightningMode) ? null : limiter, watchConfig)
                                          .delete("config/delete", (config.ultraFastMode || isLightningMode) ? null : authenticationController, (config.ultraFastMode || isLightningMode) ? null : limiter, bodyParser.json(), deleteConfig);

if (!config.ultraFastMode && !isLightningMode) {
    maxineApiRoutes = maxineApiRoutes
                                     .post("register/bulk", authenticationController, limiter, bodyParser.json(), bulkRegisterController)
                                     .put("metadata/update", authenticationController, limiter, bodyParser.json(), updateMetadataController);
}

maxineApiRoutes = maxineApiRoutes
                                    .delete("deregister", (config.ultraFastMode || isLightningMode) ? null : authenticationController, limiter, bodyParser.json(), deregisterController);

if (!config.ultraFastMode && !isLightningMode) {
    maxineApiRoutes = maxineApiRoutes
                                   .delete("deregister/bulk", authenticationController, limiter, bodyParser.json(), bulkDeregisterController);
}

maxineApiRoutes = maxineApiRoutes
                                     .get("discover", (config.ultraFastMode || isLightningMode) ? null : authenticationController, discoveryLimiter, discoveryController);

if (!config.ultraFastMode && !isLightningMode) {
    maxineApiRoutes = maxineApiRoutes
                                     .post("discover/batch", config.ultraFastMode ? null : authenticationController, discoveryLimiter, bodyParser.json(), batchDiscoveryController)
                                     .get("discover/info", config.ultraFastMode ? null : authenticationController, discoveryLimiter, discoveryInfoController)
                                    .get("discover/filtered", authenticationController, discoveryLimiter, filteredDiscoveryController)
                                        .get("discover/dns", authenticationController, discoveryLimiter, dnsController)
                                     .get("discover/database", authenticationController, discoveryLimiter, databaseDiscoveryController)
                                      .get("discover/weighted", authenticationController, discoveryLimiter, discoverWeightedController)
                                      .get("discover/least-connections", authenticationController, discoveryLimiter, discoverLeastConnectionsController)
                                      .post("bluegreen/set", authenticationController, requireRole('admin'), limiter, bodyParser.json(), setBlueGreenController)
                                    .get("health", authenticationController, limiter, healthController)
                                    .post("health/bulk", authenticationController, limiter, bodyParser.json(), bulkHealthController)
                                    .post("health/push", authenticationController, limiter, bodyParser.json(), pushHealthController)
                                    .get("health/history", authenticationController, limiter, healthHistoryController)
                                      .get("metrics", authenticationController, limiter, metricsController)
                                      .get("metrics/prometheus", authenticationController, limiter, prometheusMetricsController)
                                        .get("stats", authenticationController, limiter, statsController)
                                        .get("uptime/:serviceName", authenticationController, limiter, getServiceUptimeController)
                                        .get("sla", authenticationController, limiter, slaController)
                                        .get("health/score", authenticationController, limiter, healthScoreController)
                                       .post("autoscaling", authenticationController, requireRole('admin'), limiter, bodyParser.json(), autoscalingController)
                                       .post("chaos", authenticationController, requireRole('admin'), limiter, bodyParser.json(), chaosController)
                                       .get("cache/stats", authenticationController, limiter, cacheStatsController)
                                      .get("changes", authenticationController, limiter, changesController)
                                      .get("changes/sse", authenticationController, limiter, changesSSEController)
                                        .get("envoy/config", authenticationController, limiter, envoyConfigController)
                                        .get("istio/config", authenticationController, limiter, istioConfigController)
                                        .get("linkerd/config", authenticationController, limiter, linkerdConfigController)
                                        .get("traefik/config", authenticationController, limiter, traefikConfigController)
                                        .get("appmesh/config", authenticationController, limiter, appMeshConfigController)
                                        .get("opa/policies", authenticationController, limiter, opaPolicyController)
                                        .get("kubernetes/ingress", authenticationController, limiter, kubernetesIngressController)
                                        .get("haproxy/config", authenticationController, limiter, haproxyConfigController)
                                        .get("nginx/config", authenticationController, limiter, nginxConfigController)
                                     .post("webhooks/add", authenticationController, requireRole('admin'), limiter, bodyParser.json(), addWebhook)
                                     .delete("webhooks/remove", authenticationController, requireRole('admin'), limiter, bodyParser.json(), removeWebhook)
                                    .get("webhooks", authenticationController, limiter, getWebhooks)
                                     .post("aliases/add", authenticationController, requireRole('admin'), limiter, bodyParser.json(), addAlias)
                                     .delete("aliases/remove", authenticationController, requireRole('admin'), limiter, bodyParser.json(), removeAlias)
                                    .get("aliases", authenticationController, limiter, getAliases)
                                      .post("config/set", authenticationController, requireRole('admin'), limiter, bodyParser.json(), setConfig)
                                     .get("config/get", authenticationController, limiter, getConfig)
                                     .get("config/all", authenticationController, limiter, getAllConfig)
                                      .delete("config/delete", authenticationController, requireRole('admin'), limiter, bodyParser.json(), deleteConfig)
                                        .post("maintenance", authenticationController, requireRole('admin'), limiter, bodyParser.json(), setMaintenanceController)
                                         .post("draining", authenticationController, requireRole('admin'), limiter, bodyParser.json(), setDrainingController)
                                        .post("canary/set", authenticationController, requireRole('admin'), limiter, bodyParser.json(), setCanaryController)
                                       .post("kv/set", authenticationController, requireRole('admin'), limiter, bodyParser.json(), setKv)
                                      .get("kv/get", authenticationController, limiter, getKv)
                                      .get("kv/all", authenticationController, limiter, getAllKv)
                                       .delete("kv/delete", authenticationController, requireRole('admin'), limiter, bodyParser.json(), deleteKv)
                                       .get("backup", authenticationController, limiter, backupController)
                                        .post("restore", authenticationController, requireRole('admin'), limiter, bodyParser.json(), restoreController)
                                         .post("dependency/add", authenticationController, limiter, bodyParser.json(), addDependency)
                                         .post("dependency/remove", authenticationController, limiter, bodyParser.json(), removeDependency)
                                         .get("dependency/get", authenticationController, limiter, getDependencies)
                                         .get("dependency/dependents", authenticationController, limiter, getDependents)
                                         .get("dependency/graph", authenticationController, limiter, getDependencyGraph)
                                     .get("dependency-graph", authenticationController, limiter, dependencyGraphController)
                                         .get("dependency/cycles", authenticationController, limiter, detectCycles)
                                        .post("api-spec/set", authenticationController, requireRole('admin'), limiter, bodyParser.json(), setApiSpecController)
                                        .get("api-spec/get", authenticationController, limiter, getApiSpecController)
                                        .get("pending", authenticationController, requireRole('admin'), limiter, pendingServicesController)
                                        .post("approve", authenticationController, requireRole('admin'), limiter, bodyParser.json(), approveServiceController)
                                         .post("reject", authenticationController, requireRole('admin'), limiter, bodyParser.json(), rejectServiceController)
                                         .get("test", authenticationController, limiter, testServiceController)
                                         .post("templates/add", authenticationController, requireRole('admin'), limiter, bodyParser.json(), addServiceTemplateController)
                                         .get("templates/:name", authenticationController, limiter, getServiceTemplateController)
                                         .delete("templates/:name", authenticationController, requireRole('admin'), limiter, deleteServiceTemplateController)
                                          .get("templates", authenticationController, limiter, listServiceTemplatesController)
                                           .post("intention/set", authenticationController, requireRole('admin'), limiter, bodyParser.json(), setServiceIntentionController)
                                           .get("intention/get", authenticationController, limiter, getServiceIntentionController)
                                            .post("acl/add", authenticationController, requireRole('admin'), limiter, bodyParser.json(), addAclPolicyController)
                                            .get("acl/:name", authenticationController, limiter, getAclPolicyController)
                                            .delete("acl/:name", authenticationController, requireRole('admin'), limiter, deleteAclPolicyController)
                                            .get("acl", authenticationController, limiter, listAclPoliciesController)
                                             .post("blacklist/add", authenticationController, requireRole('admin'), limiter, bodyParser.json(), addToBlacklistController)
                                             .post("blacklist/remove", authenticationController, requireRole('admin'), limiter, bodyParser.json(), removeFromBlacklistController)
                                             .get("blacklist/:serviceName", authenticationController, limiter, getBlacklistedNodesController)
                                              .post("federation/add", authenticationController, requireRole('admin'), limiter, bodyParser.json(), federationController.addFederatedRegistry)
                                              .post("federation/remove", authenticationController, requireRole('admin'), limiter, bodyParser.json(), federationController.removeFederatedRegistry)
                                              .get("federation", authenticationController, limiter, federationController.getFederatedRegistries)
                                             .post("trace/start", authenticationController, limiter, bodyParser.json(), startTraceController)
                                             .post("trace/event", authenticationController, limiter, bodyParser.json(), addTraceEventController)
                                             .post("trace/end", authenticationController, limiter, bodyParser.json(), endTraceController)
                                             .get("trace/:id", authenticationController, limiter, getTraceController)
                                             .post("acl/set", authenticationController, requireRole('admin'), limiter, bodyParser.json(), setACLController)
                                             .get("acl/:serviceName", authenticationController, limiter, getACLController)
                                             .post("intention/set", authenticationController, requireRole('admin'), limiter, bodyParser.json(), setIntentionController)
                                             .get("intention/:source/:destination", authenticationController, limiter, getIntentionController)
                                             .post("blacklist/service/add", authenticationController, requireRole('admin'), limiter, bodyParser.json(), addServiceToBlacklistController)
                                             .post("blacklist/service/remove", authenticationController, requireRole('admin'), limiter, bodyParser.json(), removeServiceFromBlacklistController)
                                             .get("blacklist/service/:serviceName", authenticationController, limiter, isServiceBlacklistedController);
}

maxineApiRoutes = maxineApiRoutes
                                .stepBack()
                              .post("signin", bodyParser.json(), signInController)
                              .put("change-password", bodyParser.json(), changePwdController)
                               .get("roles", authenticationController, requireRole('admin'), getRolesController)
                               .get("user/roles/:username", authenticationController, requireRole('admin'), getUserRolesController)
                               .post("user/roles", authenticationController, requireRole('admin'), bodyParser.json(), setUserRoleController)
                               .post("api-keys/generate", authenticationController, requireRole('admin'), bodyParser.json(), generateApiKey)
                               .post("api-keys/revoke", authenticationController, requireRole('admin'), bodyParser.json(), revokeApiKey)
                               .get("api-keys", authenticationController, requireRole('admin'), listApiKeys)
                               .post("api-keys/validate", bodyParser.json(), validateApiKey)
                               .from("control")
                                   .put("config", config.isTestMode ? null : authenticationController, config.isTestMode ? null : requireRole('admin'), bodyParser.json(), configuratorController)
                                   .get("config", config.isTestMode ? null : authenticationController, configurationController)
                          .stepToRoot()
                            .use('/graphql', authenticationController, limiter, graphqlHTTP({
                              schema: schema,
                              rootValue: root,
                              graphiql: true,
                            }))
                           .stepToRoot()
                            .from("actuator")
                                .get("health", (req, res) => res.status(200).json({ status: 'UP' }))
                               .get("info", (req, res) => res.status(200).json({ build: { name: 'maxine-discovery', description: 'Maxine is a service discovery and a registry server for all the running nodes with gargantua client dependency.' } }))
                               .get("metrics", (req, res) => res.status(200).json({ mem: process.memoryUsage(), uptime: process.uptime() }))
                           .stepToRoot()
                             .use('/api-spec', swaggerUi.serve, swaggerUi.setup('./api-specs/swagger.yaml'))
maxineApiRoutes = maxineApiRoutes
                              .stepBack()
                            .post("signin", bodyParser.json(), signInController)
                            .put("change-password", bodyParser.json(), changePwdController)
                              .from("control")
                                  .put("config", config.isTestMode ? null : authenticationController, config.isTestMode ? null : requireRole('admin'), bodyParser.json(), configuratorController)
                                  .get("config", config.isTestMode ? null : authenticationController, configurationController)
                           .stepToRoot()
                             .use('/graphql', limiter, graphqlHTTP({
                               schema: schema,
                               rootValue: root,
                               graphiql: true,
                             }))
                          .stepToRoot()
                           .from("actuator")
                               .get("health", (req, res) => res.status(200).json({ status: 'UP' }))
                              .get("info", (req, res) => res.status(200).json({ app: { name: 'Maxine', version: '1.0.0' } }))
                              .get("metrics", (req, res) => res.status(200).json({ memory: process.memoryUsage(), uptime: process.uptime() }))
                          .stepToRoot()
                           .from("auth")
                               .get("google", googleAuth)
                               .get("google/callback", googleCallback)
                          .stepToRoot()
                           .from("chaos")
                               .post("inject-latency", bodyParser.json(), injectLatency)
                               .post("inject-failure", bodyParser.json(), injectFailure)
                               .post("reset", bodyParser.json(), resetChaos)
                               .get("status", getChaosStatus)
                          .stepToRoot()
                           // .use('/api-spec', swaggerUi.serve, swaggerUi.setup('./api-specs/swagger.yaml'))
                          .getRoute();

module.exports = maxineApiRoutes;