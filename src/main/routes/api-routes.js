const RouteBuilder = require('../builders/route-builder');
const bodyParser = require('body-parser');
const { serverListController, registryController, deregisterController } = require('../controller/maxine/registry-controller');
const discoveryController = require('../controller/maxine/discovery-controller');
const { signInController } = require('../controller/uac/signin-controller');
const { logsLinkGenController, recentLogsController, recentLogsClearController } = require('../controller/log-control/logs-controller');
const { configuratorController, configurationController } = require('../controller/config-control/configurator-controller');
const { changePwdController } = require('../controller/security/changepwd-controller');


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
                                .get("servers", serverListController)
                                .post("register", bodyParser.json(), registryController)
                                .delete("deregister", bodyParser.json(), deregisterController)
                                .get("discover", discoveryController)
                            .stepBack()
                            .post("signin", bodyParser.json(), signInController)
                            .put("change-password", bodyParser.json(), changePwdController)
                            .from("control")
                                .put("config", bodyParser.json(), configuratorController)
                                .get("config", configurationController)
                        .stepToRoot()
                        .getRoute();

module.exports = maxineApiRoutes;