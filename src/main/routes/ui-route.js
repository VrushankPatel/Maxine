const RouteBuilder = require('../builders/route-builder');
const { uiController } = require('../controller/ui-control/ui-controller');


let uiRoute = RouteBuilder.createNewRoute()
                        .get("/", uiController)
                        .getRoute();

module.exports = uiRoute;