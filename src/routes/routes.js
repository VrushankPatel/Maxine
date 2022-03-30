const RouteBuilder = require('../builders/route-builder');
const bodyParser = require('body-parser');
const { serverListController, registryController } = require('../controller/maxine/registry-controller');
const discoveryController = require('../controller/maxine/discovery-controller');
const { signInController } = require('../controller/uac/signin-controller');
const { logsDownloadController, logsLinkGenController } = require('../controller/logs/logs-controller');


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
                        .stepToRoot()
                        .getRoute();

module.exports = maxineApiRoutes;