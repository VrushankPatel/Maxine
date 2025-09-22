const RouteBuilder = require('../builders/route-builder');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const { serverListController, registryController, deregisterController, healthController, metricsController, filteredDiscoveryController, discoveryInfoController, changesController } = require('../controller/maxine/registry-controller');
const discoveryController = require('../controller/maxine/discovery-controller');
const { signInController } = require('../controller/uac/signin-controller');
const { logsLinkGenController, recentLogsController, recentLogsClearController } = require('../controller/log-control/logs-controller');
const { configuratorController, configurationController } = require('../controller/config-control/configurator-controller');
const { changePwdController } = require('../controller/security/changepwd-controller');
const { authenticationController } = require('../controller/security/authentication-controller');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
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
                                 .get("servers", authenticationController, serverListController)
                                 .post("register", authenticationController, bodyParser.json(), registryController)
                                 .delete("deregister", authenticationController, bodyParser.json(), deregisterController)
                                  .get("discover", authenticationController, discoveryController)
                                  .get("discover/info", authenticationController, discoveryInfoController)
                                  .get("discover/filtered", authenticationController, filteredDiscoveryController)
                                   .get("health", authenticationController, healthController)
                                  .get("metrics", authenticationController, metricsController)
                                  .get("changes", authenticationController, changesController)
                            .stepBack()
                            .post("signin", bodyParser.json(), signInController)
                            .put("change-password", bodyParser.json(), changePwdController)
                            .from("control")
                                .put("config", bodyParser.json(), configuratorController)
                                .get("config", configurationController)
                        .stepToRoot()
                        .getRoute();

module.exports = maxineApiRoutes;