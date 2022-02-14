const express = require('express');
const controlController = require('../../controllers/control-controller/control-controller');

const controlRoute = express.Router();

controlRoute.get('/shutdown', controlController);

module.exports = controlRoute;