const RouteBuilder = require('../builders/route-builder');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const { serverListController, registryController, deregisterController, healthController, metricsController, filteredDiscoveryController, discoveryInfoController, changesController, bulkRegisterController, bulkDeregisterController } = require('../controller/maxine/registry-controller');
const { setConfig, getConfig, getAllConfig, deleteConfig } = require('../controller/config-control/config-controller');
const { addWebhook, removeWebhook, getWebhooks } = require('../controller/webhook-controller');
const { addAlias, removeAlias, getAliases } = require('../controller/alias-controller');
const discoveryController = require('../controller/maxine/discovery-controller');
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
                                  .post("register", authenticationController, limiter, bodyParser.json(), registryController)
                                  .post("register/bulk", authenticationController, limiter, bodyParser.json(), bulkRegisterController)
                                  .delete("deregister", authenticationController, limiter, bodyParser.json(), deregisterController)
                                  .delete("deregister/bulk", authenticationController, limiter, bodyParser.json(), bulkDeregisterController)
                                  .get("discover", authenticationController, discoveryLimiter, discoveryController)
                                  .get("discover/info", authenticationController, discoveryLimiter, discoveryInfoController)
                                  .get("discover/filtered", authenticationController, discoveryLimiter, filteredDiscoveryController)
                                  .get("health", authenticationController, limiter, healthController)
                                   .get("metrics", authenticationController, limiter, metricsController)
                                    .get("changes", authenticationController, limiter, changesController)
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
                            .stepBack()
                            .post("signin", bodyParser.json(), signInController)
                            .put("change-password", bodyParser.json(), changePwdController)
                            .from("control")
                                .put("config", bodyParser.json(), configuratorController)
                                .get("config", configurationController)
                        .stepToRoot()
                        .getRoute();

module.exports = maxineApiRoutes;