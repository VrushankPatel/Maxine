var express = require('express');
const loggingUtil = require('./src/util/logging/maxine-loging-util');
const constants = require('./src/util/constants/constants');
const actuator = require('express-actuator');
const controlRoute = require('./src/routes/control-route');

var app = express()

app = loggingUtil.getLogger(app);

app.use(actuator(constants.ACTUATORCONFIG));
app.use('/control',controlRoute);


app.listen(constants.PORT, loggingUtil.initApp);