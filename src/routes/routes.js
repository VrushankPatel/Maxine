const RouteBuilder = require('../builders/route-builder');
const {logsDownloadController, logsLinkGenController} = require('../controllers/logs-controller');
const bodyParser = require('body-parser');
const { serverListController, discoveryController } = require('../controllers/maxine/discovery-controller');

var maxineApiRoutes = RouteBuilder.createNewRoute()
                        .from("logs")
                            .from("download")
                                .get("/",logsLinkGenController)
                                .get(":level", logsDownloadController)
                        .stepToRoot()
                        .from("maxine")
                            .post("register", bodyParser.json(), discoveryController)
                            .get("servers", serverListController)
                        .stepToRoot()
                        .getRoute();

module.exports = maxineApiRoutes;