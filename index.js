const loggingUtil = require('./src/util/logging/maxine-logging-util');
const { constants } = require('./src/util/constants/constants');
const actuator = require('express-actuator');
const AppBuilder = require('./src/builders/AppBuilder');
const { statusMonitorConfig, actuatorConfig } = require('./src/config/config');
const { logRequest, logWebExceptions } = require('./src/util/logging/maxine-logging-util');
const maxineRoutes = require('./src/routes/routes');
const expressStatusMonitor = require('express-status-monitor');

// below starts to send requests to it self
// require('./src/routines/routine').startRoutines();


const app = AppBuilder.createNewApp()
                .use(expressStatusMonitor(statusMonitorConfig))
                .use(logRequest)
                .checkProperty("actuator.enabled")                    
                        .use(actuator(actuatorConfig))
                .endAllCheck()
                .use('/',maxineRoutes)
                .use(logWebExceptions)
                .getApp();

app.listen(constants.PORT, loggingUtil.initApp);