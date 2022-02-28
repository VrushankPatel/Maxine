const RouteBuilder = require('../builders/route-builder');
const {logsDownloadController: logsController, logsDownloadController, logsLinkGenController} = require('../controllers/logs-controller');
const bodyParser = require('body-parser');
const { serverListController, discoveryController } = require('../controllers/discovery-controller');
const { shutdownController, malformedUrlsController } = require('../controllers/other-controllers');


var maxineRoutes = RouteBuilder.createNewRoute()
                        .from("control")
                            .get("shutdown", shutdownController)
                        .stepToRoot()
                        .from("logs")
                            .from("download")
                                .get("/",logsLinkGenController)
                                .get(":level", logsDownloadController)
                        .stepToRoot()
                        .from("maxine")
                            .post("register", bodyParser.json(), discoveryController)
                            .get("servers", serverListController)
                        .stepToRoot()
                        .all('*',malformedUrlsController)
                        .getRoute();

module.exports = maxineRoutes;