const express = require('express');
const { httpStatus } = require('../../util/constants/constants');

const controlRoute = express.Router();

controlRoute.get('/shutdown', (req, res) => {    
    res.status(httpStatus.STATUS_SUCCESS).json({"message" : httpStatus.MSG_SUCCESS_SHUTDOWN});
    process.exit();
});

module.exports = controlRoute;