const RouteBuilder = require('../builders/RouteBuilder');
const logsController = require('../controllers/logs-controller/logs-controller');
const bodyParser = require('body-parser');
const { serverListController, discoveryController } = require('../controllers/discovery-controller/discovery-controller');
const { shutdownController, malformedUrlsController } = require('../controllers/micro-controllers/other-controllers');


var maxineRoutes = RouteBuilder.createNewRoute()
                        .get("sd", () => SVGDefsElement.sd()) // to test exceptions logging
                        .from("control")
                            .get("shutdown", shutdownController)
                        .stepToRoot()
                        .from("logs")
                            .from("download")
                                .get(":level", logsController)
                        .stepToRoot()
                        .from("maxine")
                            .post("register", bodyParser.json(), discoveryController)
                            .get("servers", serverListController)
                        .stepToRoot()
                        .all('*',malformedUrlsController)                        
                        .getRoute();

module.exports = maxineRoutes;