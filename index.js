var express = require('express');
const loggingUtil = require('./src/util/logging/maxine-request-logger');
const constants = require('./src/util/constants/constants');
const actuatorRoute = require('./src/routes/actuator-route');
var app = express()

app = loggingUtil.getLogger(app);

app.use('/actuator',actuatorRoute);


app.listen(constants.PORT, loggingUtil.initApp);