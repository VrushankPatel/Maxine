const express = require('express');
const fs = require('fs');
const logsController = require('../../controllers/logs-controller/logs-controller');
const { constants, httpStatus } = require('../../util/constants/constants');
const { error } = require('../../util/logging/maxine-logging-util');
const logsRoute = express.Router();

logsRoute.get('/download/:level', logsController);

module.exports = logsRoute; 