const RouteBuilder = require('../builders/route-builder');
const bodyParser = require('body-parser');
const { serverListController, registryController } = require('../controller/maxine/registry-controller');
const discoveryController = require('../controller/maxine/discovery-controller');
const { signInController } = require('../controller/uac/signin-controller');
const { logsDownloadController, logsLinkGenController } = require('../controller/log-control/logs-controller');
const { configuratorController } = require('../controller/config-control/configurator-controller');


var maxineApiRoutes = RouteBuilder.createNewRoute()
                        .from("logs")
                            .from("download")
                                .get("/",logsLinkGenController)
                                .get(":level", logsDownloadController)
                        .stepToRoot()
                        .from("maxine")
                            .get("servers", serverListController)
                            .post("register", bodyParser.json(), registryController)
                            .get("discover", discoveryController)
                            .post("signin", bodyParser.json(), signInController)
                            .put("config", bodyParser.json(), configuratorController)
                        .stepToRoot()
                        .getRoute();

module.exports = maxineApiRoutes;