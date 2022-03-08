var RouteBuilder = require('../builders/route-builder');
const { logsDownloadController, logsLinkGenController } = require('../controllers/logs-controller');
const bodyParser = require('body-parser');
const { serverListController, registryController } = require('../controllers/maxine/registry-controller');
const { discoveryController } = require('../controllers/maxine/discovery-controller');


export const maxineApiRoutes = RouteBuilder.createNewRoute()
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