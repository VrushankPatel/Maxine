var express = require('express');
const loggingUtil = require('./logging/maxine-request-logger');
const constants = require('./constants/constants');
var app = express()
app.use(loggingUtil.logger);


app.get('/HealthCheck', function (req, res) {
    res.status(200).json({"message" : "I'm up and running"});
});

app.listen(constants.PORT, loggingUtil.initApp);