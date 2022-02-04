const RouteBuilder = require('../builders/RouteBuilder');
const controlRoute = require('./control-route/control-route');
const malformedRoutes = require('./malformed-routes/malformed-routes');

var maxineRoutes = RouteBuilder.createNewRoute()
                        .mapRoute("/sd", () => SVGDefsElement.sd())
                        .mapRoute('/control',controlRoute)
                        .mapRoute('*',malformedRoutes)
                        .getRoute();

module.exports = maxineRoutes;