const RouteBuilder = require('../builders/route-builder');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const { serverListController, registryController, deregisterController, healthController, bulkHealthController, healthHistoryController, metricsController, prometheusMetricsController, cacheStatsController, filteredDiscoveryController, discoveryInfoController, changesController, bulkRegisterController, bulkDeregisterController, setMaintenanceController } = require('../controller/maxine/registry-controller');
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

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10000, // limit each IP to 10000 requests per windowMs for non-discovery endpoints
    message: 'Too many requests from this IP, please try again later.'
});

const discoveryLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100000, // allow high rate for discovery requests
    message: 'Too many discovery requests, please try again later.'
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
                                    .get("health/history", authenticationController, limiter, healthHistoryController)
                                     .get("metrics", authenticationController, limiter, metricsController)
                                     .get("metrics/prometheus", authenticationController, limiter, prometheusMetricsController)
                                     .get("cache/stats", authenticationController, limiter, cacheStatsController)
                                     .get("changes", authenticationController, limiter, changesController)
                                     .get("envoy/config", authenticationController, limiter, envoyConfigController)
                                     .post("webhooks/add", authenticationController, limiter, bodyParser.json(), addWebhook)
                                    .delete("webhooks/remove", authenticationController, limiter, bodyParser.json(), removeWebhook)
                                    .get("webhooks", authenticationController, limiter, getWebhooks)
                                    .post("aliases/add", authenticationController, limiter, bodyParser.json(), addAlias)
                                    .delete("aliases/remove", authenticationController, limiter, bodyParser.json(), removeAlias)
                                    .get("aliases", authenticationController, limiter, getAliases)
                                     .post("config/set", authenticationController, limiter, bodyParser.json(), setConfig)
                                     .get("config/get", authenticationController, limiter, getConfig)
                                     .get("config/all", authenticationController, limiter, getAllConfig)
                                     .delete("config/delete", authenticationController, limiter, bodyParser.json(), deleteConfig)
                                      .post("maintenance", authenticationController, limiter, bodyParser.json(), setMaintenanceController)
                                     .post("kv/set", authenticationController, limiter, bodyParser.json(), setKv)
                                     .get("kv/get", authenticationController, limiter, getKv)
                                     .get("kv/all", authenticationController, limiter, getAllKv)
                                     .delete("kv/delete", authenticationController, limiter, bodyParser.json(), deleteKv)
                            .stepBack()
                            .post("signin", bodyParser.json(), signInController)
                            .put("change-password", bodyParser.json(), changePwdController)
                            .from("control")
                                .put("config", bodyParser.json(), configuratorController)
                                .get("config", configurationController)
                        .stepToRoot()
                        .getRoute();

module.exports = maxineApiRoutes;