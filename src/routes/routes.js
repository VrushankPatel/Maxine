const RouteBuilder = require('../builders/route-builder');
const {logsDownloadController, logsLinkGenController} = require('../controller/logs-controller');
const bodyParser = require('body-parser');
const { serverListController, registryController } = require('../controller/maxine/registry-controller');
const discoveryController = require('../controller/maxine/discovery-controller');


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
                            .stepToRoot()
                        .stepToRoot()
                        .getRoute();

module.exports = maxineApiRoutes;