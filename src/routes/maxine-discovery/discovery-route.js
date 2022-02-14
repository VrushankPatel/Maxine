const express = require('express');
const bodyParser = require('body-parser');
const discoveryController = require('../../controllers/discovery-controller/discovery-controller');

const discoveryRoute = express.Router();
var jsonParser = bodyParser.json()

discoveryRoute.post('/register', jsonParser, discoveryController);

module.exports = discoveryRoute;