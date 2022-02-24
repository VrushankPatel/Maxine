const RouteBuilder = require('../builders/RouteBuilder');
const {logsDownloadController: logsController, logsDownloadController, logsLinkGenController} = require('../controllers/logsController');
const bodyParser = require('body-parser');
const { serverListController, discoveryController } = require('../controllers/discoveryController');
const { shutdownController, malformedUrlsController } = require('../controllers/otherControllers');


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