const express = require('express');
const { httpStatus } = require('../../util/constants/constants');
const bodyParser = require('body-parser');
const { logger, info, error } = require('../../util/logging/maxine-logging-util');

const discoveryRoute = express.Router();
var jsonParser = bodyParser.json()

discoveryRoute.post('/register', jsonParser, (req, res) => {    
    let {hostName, port, serviceName} = req.body;
    port = parseInt(port);
    if(hostName && port && serviceName){
        const msg = `${httpStatus.MSG_SUCCESS_REGISTERED} [${serviceName} to ${hostName}:${port}]`;
        info(httpStatus.STATUS_SUCCESS, msg);
        res.status(httpStatus.STATUS_SUCCESS).json({"message" : msg});
        return;
    }
    error(httpStatus.STATUS_GENERIC_ERROR, httpStatus.MSG_MISSING_DATA);
    res.status(httpStatus.STATUS_GENERIC_ERROR).json({"message" : httpStatus.MSG_MISSING_DATA});
});

module.exports = discoveryRoute;