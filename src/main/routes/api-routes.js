const RouteBuilder = require('../builders/route-builder');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const { serverListController, registryController, deregisterController, healthController, bulkHealthController, pushHealthController, healthHistoryController, metricsController, prometheusMetricsController, cacheStatsController, filteredDiscoveryController, discoveryInfoController, changesController, bulkRegisterController, bulkDeregisterController, setMaintenanceController, backupController, restoreController, dependencyGraphController, impactAnalysisController, setApiSpecController, getApiSpecController } = require('../controller/maxine/registry-controller');
const batchDiscoveryController = require('../controller/maxine/batch-discovery-controller');
const envoyConfigController = require('../controller/maxine/envoy-controller');
const { setConfig, getConfig, getAllConfig, deleteConfig } = require('../controller/config-control/config-controller');
const { addWebhook, removeWebhook, getWebhooks } = require('../controller/webhook-controller');
const { addAlias, removeAlias, getAliases } = require('../controller/alias-controller');
const { setKv, getKv, deleteKv, getAllKv } = require('../controller/kv-controller');
const discoveryController = require('../controller/maxine/discovery-controller');
const dnsController = require('../controller/maxine/dns-controller');
const { signInController } = require('../controller/uac/signin-controller');
const { logsLinkGenController, recentLogsController, recentLogsClearController } = require('../controller/log-control/logs-controller');
const { configuratorController, configurationController } = require('../controller/config-control/configurator-controller');
const { changePwdController } = require('../controller/security/changepwd-controller');
const { authenticationController } = require('../controller/security/authentication-controller');
const { requireRole } = require('../controller/security/authorization-controller');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10000, // limit each IP to 10000 requests per windowMs for non-discovery endpoints
    message: 'Too many requests from this IP, please try again later.'
});

const discoveryLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100000, // allow high rate for discovery requests
    keyGenerator: (req) => `${req.query.serviceName || 'unknown'}:${rateLimit.ipKeyGenerator(req)}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many discovery requests for this service from this IP, please try again later.'
});


let maxineApiRoutes = RouteBuilder.createNewRoute()
                        .from("logs")
                            .from("download")
                                .get("/",logsLinkGenController)
                            .stepBack()
                            .from("recent")
                                .get("/", recentLogsController)
                                .get("/clear", recentLogsClearController)
                        .stepToRoot()
                         .from("maxine")
                             .from("serviceops")
                                  .get("servers", authenticationController, limiter, serverListController)
                                    .post("register", authenticationController, bodyParser.json(), registryController)
                                   .post("register/bulk", authenticationController, limiter, bodyParser.json(), bulkRegisterController)
                                   .delete("deregister", authenticationController, limiter, bodyParser.json(), deregisterController)
                                   .delete("deregister/bulk", authenticationController, limiter, bodyParser.json(), bulkDeregisterController)
                                   .get("discover", authenticationController, discoveryLimiter, discoveryController)
                                    .post("discover/batch", authenticationController, discoveryLimiter, bodyParser.json(), batchDiscoveryController)
                                    .get("discover/info", authenticationController, discoveryLimiter, discoveryInfoController)
                                    .get("discover/filtered", authenticationController, discoveryLimiter, filteredDiscoveryController)
                                    .get("discover/dns", authenticationController, discoveryLimiter, dnsController)
                                    .get("health", authenticationController, limiter, healthController)
                                    .post("health/bulk", authenticationController, limiter, bodyParser.json(), bulkHealthController)
                                    .post("health/push", authenticationController, limiter, bodyParser.json(), pushHealthController)
                                    .get("health/history", authenticationController, limiter, healthHistoryController)
                                     .get("metrics", authenticationController, limiter, metricsController)
                                     .get("metrics/prometheus", authenticationController, limiter, prometheusMetricsController)
                                     .get("cache/stats", authenticationController, limiter, cacheStatsController)
                                     .get("changes", authenticationController, limiter, changesController)
                                     .get("envoy/config", authenticationController, limiter, envoyConfigController)
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
                                       .post("kv/set", authenticationController, requireRole('admin'), limiter, bodyParser.json(), setKv)
                                      .get("kv/get", authenticationController, limiter, getKv)
                                      .get("kv/all", authenticationController, limiter, getAllKv)
                                       .delete("kv/delete", authenticationController, requireRole('admin'), limiter, bodyParser.json(), deleteKv)
                                       .get("backup", authenticationController, limiter, backupController)
                                        .post("restore", authenticationController, requireRole('admin'), limiter, bodyParser.json(), restoreController)
                                        .get("dependency/graph", authenticationController, limiter, dependencyGraphController)
                                        .get("impact/analysis", authenticationController, limiter, impactAnalysisController)
                                        .post("api-spec/set", authenticationController, requireRole('admin'), limiter, bodyParser.json(), setApiSpecController)
                                        .get("api-spec/get", authenticationController, limiter, getApiSpecController)
                            .stepBack()
                            .post("signin", bodyParser.json(), signInController)
                            .put("change-password", bodyParser.json(), changePwdController)
                             .from("control")
                                 .put("config", authenticationController, requireRole('admin'), bodyParser.json(), configuratorController)
                                 .get("config", authenticationController, configurationController)
                        .stepToRoot()
                        .getRoute();

module.exports = maxineApiRoutes;