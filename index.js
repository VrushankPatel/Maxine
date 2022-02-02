var express = require('express');
const actuator = require('express-actuator');
const controlRoute = require('./src/routes/control-route');
const config = require('./src/util/config/config');
const loggingUtil = require('./src/util/logging/maxine-loging-util');
const http = require('http');
const malformedRoute = require('./src/routes/malformed-routes');
const expressStatusMonitor = require('express-status-monitor');
const { constants } = require('./src/util/constants/constants');

var app = express();

var server = http.createServer(app);

app.use(expressStatusMonitor(config.statusMonitorConfig));
app.use(loggingUtil.logRequest);
app.use(actuator(config.actuatorConfig));
app.use('/control',controlRoute);
app.use('*',malformedRoute);

server.listen(constants.PORT, loggingUtil.initApp);