var express = require('express');
var actuatorRoute = express.Router();

actuatorRoute.get('/health', (req, res) => {
    res.status(200).json({"message" : "I'm up and running"});
});

actuatorRoute.get('/shutdown', (req, res) => {
    res.status(200).json({"message" : "Initiated shutdown."});
    process.exit();
});

module.exports = actuatorRoute;