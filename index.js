const loggingUtil = require('./src/util/logging/maxine-loging-util');
const { constants } = require('./src/util/constants/constants');
const AppBuilder = require('./src/builder/AppBuilder');

var app = AppBuilder.createNewApp()
                .registerExpressStatusMonitorEndpoint()
                .registerRequestLogger()
                .registerActuatorEndpoint()
                .registerControlRoute()
                .mapUrlPatterns()
                .handleGenericExceptions()
                .handleMalformedUrls()
                .getApp();

app.listen(constants.PORT, loggingUtil.initApp);