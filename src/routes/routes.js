const RouteBuilder = require('../builders/RouteBuilder');

var maxineRoutes = RouteBuilder.createNewRoute()
                        .mapTestRoute()
                        .mapControlRoute()
                        .register()
                        .getRoute();

module.exports = maxineRoutes;