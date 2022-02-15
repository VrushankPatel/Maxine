const express = require('express');
const bodyParser = require('body-parser');
const discoveryController = require('../../controllers/discovery-controller/discovery-controller');
const { getCurrentlyRegisteredServers } = require('../../serviceRegistry/registry');

const discoveryRoute = express.Router();
var jsonParser = bodyParser.json()

discoveryRoute.post('/register', jsonParser, discoveryController);

discoveryRoute.get("/servers", (req, res) => {    
    res.send(JSON.stringify(getCurrentlyRegisteredServers()));
})

module.exports = discoveryRoute;